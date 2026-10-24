"""Boot configuration must select the gateway in the pinned resolver's model section."""
import builtins
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest


def boot(tmp_path, monkeypatch, template_config, environment):
    """Run the boot program from entrypoint.sh over a template and return what it wrote.

    JSON is sufficient here: it exercises the actual boot program independently
    of YAML's codec.
    """
    script = (Path(__file__).parents[1] / "entrypoint.sh").read_text()
    source = script.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
    template = tmp_path / "template.json"
    target = tmp_path / "config.json"
    template.write_text(json.dumps(template_config))
    native_open = builtins.open

    def scoped_open(path, *args, **kwargs):
        if str(path) == "/opt/openduet-runtime/config.yaml":
            path = template
        return native_open(path, *args, **kwargs)

    monkeypatch.setitem(sys.modules, "yaml", SimpleNamespace(
        safe_load=json.load,
        safe_dump=lambda value, stream, **kwargs: json.dump(value, stream),
    ))
    monkeypatch.setattr(builtins, "open", scoped_open)
    monkeypatch.setattr(sys, "argv", ["-", str(target)])
    for variable in (
        "OPENDUET_ENGINE_CONTEXT_LENGTH",
        "OPENDUET_ENGINE_COMPACTION_THRESHOLD",
        "OPENDUET_ENGINE_MAX_TURNS",
        "OPENDUET_ENGINE_MAX_OUTPUT_TOKENS",
        "OPENDUET_MODEL_API_MODE",
        "OPENDUET_ENGINE_SUPPORTS_VISION",
        "TERMINAL_ENV",
    ):
        monkeypatch.delenv(variable, raising=False)
    for key, value in environment.items():
        monkeypatch.setenv(key, value)
    exec(compile(source, "entrypoint.sh", "exec"), {})
    return json.loads(target.read_text())


BASE_ENVIRONMENT = {
    "OPENDUET_ATTEMPT_TOKEN": "fixture-capability",
    "OPENDUET_BROKER_URL": "http://broker:19188",
}

TEMPLATE = {
    "model": {"max_tokens": 4096, "context_length": 1000000},
    "compression": {"enabled": True, "threshold_tokens": 200000},
    "agent": {"max_turns": 150},
    "providers": {"openduet-gateway": {"key_env": "OPENDUET_MODEL_KEY"}},
}


@pytest.mark.parametrize("provider,model", [
    ("scripted", "scripted"),
    ("fireworks", "accounts/fireworks/models/deepseek-v4p1-flash"),
])
def test_boot_config_selects_only_the_scoped_gateway(tmp_path, monkeypatch, provider, model):
    config = boot(tmp_path, monkeypatch, TEMPLATE, {
        **BASE_ENVIRONMENT,
        "OPENDUET_MODEL_PROVIDER": provider,
        "OPENDUET_MODEL_NAME": model,
        "OPENDUET_MODEL_API_MODE": "chat_completions",
    })
    assert config["model"]["provider"] == "openduet-gateway"
    assert config["model"]["default"] == model
    assert config["model"]["max_tokens"] == 4096
    assert config["providers"]["openduet-gateway"]["base_url"] == f"http://broker:19188/providers/{provider}/v1"
    assert config["providers"]["openduet-gateway"]["key_env"] == "OPENDUET_MODEL_KEY"
    assert config["providers"]["openduet-gateway"]["extra_headers"] == {"x-openduet-capability": "fixture-capability"}


def test_boot_config_carries_capability_in_model_headers(tmp_path, monkeypatch):
    """The compaction summary call is built by an auxiliary client that reads
    `model.extra_headers` and never the provider entry, so a capability written
    only under the provider reaches the gateway without one and is refused."""
    config = boot(tmp_path, monkeypatch, TEMPLATE, {
        **BASE_ENVIRONMENT,
        "OPENDUET_MODEL_PROVIDER": "fireworks",
        "OPENDUET_MODEL_NAME": "accounts/fireworks/models/deepseek-v4p1-flash",
    })
    header = {"x-openduet-capability": "fixture-capability"}
    assert config["model"]["extra_headers"] == header
    assert config["providers"]["openduet-gateway"]["extra_headers"] == header


def test_boot_config_takes_the_window_and_trigger_it_is_given(tmp_path, monkeypatch):
    """The model an attempt is granted decides its window, and the window decides
    the compaction trigger. Whatever starts the container renders both and passes
    them in; the image's own copy is only the default."""
    config = boot(tmp_path, monkeypatch, TEMPLATE, {
        **BASE_ENVIRONMENT,
        "OPENDUET_MODEL_PROVIDER": "fireworks",
        "OPENDUET_MODEL_NAME": "a-smaller-model",
        "OPENDUET_ENGINE_CONTEXT_LENGTH": "128000",
        "OPENDUET_ENGINE_COMPACTION_THRESHOLD": "96000",
        "OPENDUET_ENGINE_MAX_TURNS": "150",
    })
    assert config["model"]["context_length"] == 128000
    assert config["compression"]["threshold_tokens"] == 96000
    assert config["compression"]["enabled"] is True
    assert config["agent"]["max_turns"] == 150


def test_boot_config_keeps_the_image_defaults_when_nothing_is_passed(tmp_path, monkeypatch):
    config = boot(tmp_path, monkeypatch, TEMPLATE, {
        **BASE_ENVIRONMENT,
        "OPENDUET_MODEL_PROVIDER": "fireworks",
        "OPENDUET_MODEL_NAME": "accounts/fireworks/models/deepseek-v4p1-flash",
    })
    assert config["model"]["context_length"] == 1000000
    assert config["compression"]["threshold_tokens"] == 200000
    assert config["agent"]["max_turns"] == 150
    assert config["model"]["max_tokens"] == 4096


@pytest.mark.parametrize("limit", [1, 512, 4096, 8192])
def test_boot_config_applies_the_rendered_output_ceiling(tmp_path, monkeypatch, limit):
    config = boot(tmp_path, monkeypatch, TEMPLATE, {
        **BASE_ENVIRONMENT,
        "OPENDUET_ENGINE_MAX_OUTPUT_TOKENS": str(limit),
    })
    assert config["model"]["max_tokens"] == limit
    headers = {"x-openduet-capability": "fixture-capability", "x-openduet-clamp-output": "1"}
    assert config["model"]["extra_headers"] == headers
    assert config["providers"]["openduet-gateway"]["extra_headers"] == headers
    assert config["model"]["context_length"] == TEMPLATE["model"]["context_length"]
    assert config["compression"] == TEMPLATE["compression"]


def test_boot_does_not_add_an_output_ceiling_when_absent_from_image_and_environment(tmp_path, monkeypatch):
    template = {**TEMPLATE, "model": {"context_length": 1000000}}
    config = boot(tmp_path, monkeypatch, template, BASE_ENVIRONMENT)
    assert "max_tokens" not in config["model"]


def test_output_ceiling_boot_matches_the_shared_renderer(tmp_path, monkeypatch):
    """The container boot and process renderer must request the same bounded output."""
    rendered = subprocess.run([
        "bun", "--eval", """
        import {engineConfigEnvironment, renderEngineConfig} from './src/engine-config.ts';
        const base = {provider: 'fireworks', model: 'accounts/fireworks/models/deepseek-v4p1-flash', brokerUrl: 'http://broker:19188'};
        const bounded = {...base, maxOutputTokens: 512};
        console.log(JSON.stringify({
          template: renderEngineConfig(base),
          environment: engineConfigEnvironment(bounded),
          expected: renderEngineConfig({...bounded, capability: 'fixture-capability'}),
        }));
        """,
    ], cwd=Path(__file__).parents[1], capture_output=True, text=True, check=True)
    values = json.loads(rendered.stdout)
    config = boot(tmp_path, monkeypatch, values["template"], {
        **BASE_ENVIRONMENT, **values["environment"],
    })
    assert config == values["expected"]


@pytest.mark.parametrize("value", ["", "0", "-1", "1.5", "1e3", "NaN", "Infinity", " 512", "512 ", "+512", "9007199254740992", "１２"])
def test_boot_refuses_an_invalid_output_ceiling(tmp_path, monkeypatch, value):
    with pytest.raises(SystemExit, match="OPENDUET_ENGINE_MAX_OUTPUT_TOKENS"):
        boot(tmp_path, monkeypatch, TEMPLATE, {
            **BASE_ENVIRONMENT, "OPENDUET_ENGINE_MAX_OUTPUT_TOKENS": value,
        })


@pytest.mark.parametrize("variable", [
    "OPENDUET_ENGINE_CONTEXT_LENGTH",
    "OPENDUET_ENGINE_COMPACTION_THRESHOLD",
    "OPENDUET_ENGINE_MAX_TURNS",
])
def test_boot_refuses_a_number_it_cannot_read(tmp_path, monkeypatch, variable):
    """Ignoring a malformed number would leave the engine compacting against one
    window while the attempt is metered against another."""
    with pytest.raises(SystemExit):
        boot(tmp_path, monkeypatch, TEMPLATE, {
            **BASE_ENVIRONMENT,
            "OPENDUET_MODEL_PROVIDER": "fireworks",
            "OPENDUET_MODEL_NAME": "accounts/fireworks/models/deepseek-v4p1-flash",
            variable: "many",
        })


def test_a_sandbox_space_gets_the_engine_terminal_pinned_to_the_sandbox(tmp_path, monkeypatch):
    template = {**TEMPLATE, "platform_toolsets": {"api_server": ["openduet"]}}
    written = boot(tmp_path, monkeypatch, template, {**BASE_ENVIRONMENT, "TERMINAL_ENV": "openduet_sandbox"})
    assert written["terminal"] == {"backend": "openduet_sandbox", "cwd": "/work"}
    assert written["platform_toolsets"]["api_server"] == ["openduet", "terminal_tools"]


def test_without_a_sandbox_there_is_no_terminal_at_all(tmp_path, monkeypatch):
    # An image copy that somehow carried a terminal section loses it at boot.
    template = {**TEMPLATE, "platform_toolsets": {"api_server": ["openduet"]}, "terminal": {"backend": "local"}}
    written = boot(tmp_path, monkeypatch, template, BASE_ENVIRONMENT)
    assert "terminal" not in written
    assert written["platform_toolsets"]["api_server"] == ["openduet"]


@pytest.mark.parametrize("backend", ["local", "docker", "modal", "OPENDUET_SANDBOX"])
def test_no_other_terminal_backend_is_accepted(tmp_path, monkeypatch, backend):
    with pytest.raises(SystemExit):
        boot(tmp_path, monkeypatch, TEMPLATE, {**BASE_ENVIRONMENT, "TERMINAL_ENV": backend})


def test_a_spare_is_configured_without_a_capability_until_it_has_one(tmp_path, monkeypatch):
    """A spare boots before its attempt exists; the same program runs again
    with the attempt's capability once the attempt is handed over."""
    monkeypatch.delenv("OPENDUET_ATTEMPT_TOKEN", raising=False)
    spare = boot(tmp_path, monkeypatch, TEMPLATE, {
        "OPENDUET_BROKER_URL": "http://broker:19188",
        "OPENDUET_RUNTIME_SPARE": "1",
    })
    assert "extra_headers" not in spare["model"]
    assert "extra_headers" not in spare["providers"]["openduet-gateway"]
    handed = boot(tmp_path, monkeypatch, TEMPLATE, BASE_ENVIRONMENT)
    assert handed["model"]["extra_headers"] == {"x-openduet-capability": "fixture-capability"}


def test_an_engine_that_is_not_a_spare_never_starts_without_a_capability(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENDUET_ATTEMPT_TOKEN", raising=False)
    monkeypatch.delenv("OPENDUET_RUNTIME_SPARE", raising=False)
    with pytest.raises(SystemExit):
        boot(tmp_path, monkeypatch, TEMPLATE, {"OPENDUET_BROKER_URL": "http://broker:19188"})


@pytest.mark.parametrize(("value", "expected"), [("1", True), ("0", False)])
def test_boot_config_says_whether_the_model_sees_pictures(tmp_path, monkeypatch, value, expected):
    """The engine reads model.supports_vision before any catalog it could not
    reach from the container; the attempt's renderer decides it."""
    config = boot(tmp_path, monkeypatch, TEMPLATE, {**BASE_ENVIRONMENT, "OPENDUET_ENGINE_SUPPORTS_VISION": value})
    assert config["model"]["supports_vision"] is expected


def test_boot_refuses_a_vision_answer_it_cannot_read(tmp_path, monkeypatch):
    with pytest.raises(SystemExit):
        boot(tmp_path, monkeypatch, TEMPLATE, {**BASE_ENVIRONMENT, "OPENDUET_ENGINE_SUPPORTS_VISION": "yes"})


def test_helpers_are_built_only_when_the_attempt_asks_for_them(tmp_path, monkeypatch):
    template = {**TEMPLATE, "platform_toolsets": {"api_server": ["openduet", "todo"]}}
    written = boot(tmp_path, monkeypatch, template, BASE_ENVIRONMENT)
    assert written["platform_toolsets"]["api_server"] == ["openduet", "todo"]
    written = boot(tmp_path, monkeypatch, template, {
        **BASE_ENVIRONMENT, "OPENDUET_ENGINE_DELEGATION": "1", "TERMINAL_ENV": "openduet_sandbox"})
    assert written["platform_toolsets"]["api_server"] == ["openduet", "todo", "delegation", "terminal_tools"]
    # An image copy that somehow named them loses them unless asked.
    monkeypatch.delenv("OPENDUET_ENGINE_DELEGATION")
    monkeypatch.delenv("TERMINAL_ENV")
    stale = {**TEMPLATE, "platform_toolsets": {"api_server": ["openduet", "todo", "delegation"]}}
    written = boot(tmp_path, monkeypatch, stale, BASE_ENVIRONMENT)
    assert written["platform_toolsets"]["api_server"] == ["openduet", "todo"]


@pytest.mark.parametrize("value", ["0", "true", "yes"])
def test_helpers_take_only_the_value_the_renderer_writes(tmp_path, monkeypatch, value):
    with pytest.raises(SystemExit):
        boot(tmp_path, monkeypatch, TEMPLATE, {**BASE_ENVIRONMENT, "OPENDUET_ENGINE_DELEGATION": value})
