"""The audited gateway constructor must preserve the configured output ceiling."""
from __future__ import annotations

import ast
import http.server
import importlib.util
import json
import os
import sys
import threading
import time
import types
from pathlib import Path

import pytest

PACKAGE = Path(__file__).parents[1]
NAME = "gateway/run.py"
AUX_NAME = "agent/auxiliary_client.py"


def bridge():
    spec = importlib.util.spec_from_file_location("output_observer_bridge", PACKAGE / "patches" / "observer_bridge.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def engine_source(name=NAME):
    root = Path(os.environ.get("OPENDUET_HERMES_ROOT") or PACKAGE.parents[1] / ".hermes-src")
    target = root / name
    if not target.exists():
        installed = importlib.util.find_spec("hermes_constants")
        if installed and installed.origin:
            target = Path(installed.origin).parent / name
    if not target.exists():
        pytest.skip(f"No pinned engine checkout at {root}; set OPENDUET_HERMES_ROOT to run this.")
    return target.read_text(encoding="utf-8")


def constructor(source):
    """Execute the actual gateway function without importing unrelated platform adapters."""
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "_runtime_agent_kwargs")
    scope = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), NAME, "exec"), scope)
    return scope["_runtime_agent_kwargs"]


def configured_constructor(monkeypatch, config):
    provider = types.ModuleType("hermes_cli.runtime_provider")
    provider._get_model_config = lambda: config
    monkeypatch.setitem(sys.modules, "hermes_cli.runtime_provider", provider)
    _, changes = bridge().PATCHES[NAME]
    return constructor(changes[0][1])


@pytest.mark.parametrize("limit", [1, 512, 4096, 9007199254740991])
def test_gateway_passes_the_configured_positive_output_ceiling(monkeypatch, limit):
    runtime = {"api_key": "surrogate", "base_url": "http://broker/providers/probe/v1", "provider": "custom",
               "requested_provider": "openduet-gateway", "api_mode": "anthropic_messages", "args": ["arg"],
               "request_overrides": {"temperature": 0}, "credential_pool": object()}
    module = bridge()
    original = constructor(module.PATCHES[NAME][1][0][0])(runtime)
    bounded = configured_constructor(monkeypatch, {"max_tokens": limit})(runtime)
    assert bounded == {**original, "max_tokens": limit}


def test_absent_ceiling_preserves_the_original_constructor_and_does_not_choose_a_default(monkeypatch):
    runtime = {"api_key": "surrogate", "args": None}
    original = constructor(bridge().PATCHES[NAME][1][0][0])(runtime)
    assert configured_constructor(monkeypatch, {})(runtime) == original
    assert "max_tokens" not in original


@pytest.mark.parametrize("value", [None, True, False, 0, -1, 1.5, "512", "", float("nan"), float("inf"), 9007199254740992])
def test_invalid_configured_ceiling_is_refused_instead_of_using_a_provider_default(monkeypatch, value):
    with pytest.raises(ValueError, match="model.max_tokens"):
        configured_constructor(monkeypatch, {"max_tokens": value})({})


@pytest.mark.parametrize('name', [NAME, AUX_NAME])
def test_the_seam_applies_only_to_the_pin_and_is_idempotent(name):
    module = bridge()
    original = engine_source(name)
    expected, changes = module.PATCHES[name]
    patched = module.patched(original, expected, changes)
    marker = 'gateway-output' if name == NAME else 'auxiliary-output'
    assert patched.count(f"# OpenDuet {marker} seam") == 1
    assert module.patched(patched, expected, changes) == patched
    with pytest.raises(ValueError):
        module.patched(patched + "\n# unrelated change\n", expected, changes)


def test_unreviewed_gateway_source_is_refused_without_an_engine_checkout():
    module = bridge()
    with pytest.raises(ValueError):
        module.patched("def _runtime_agent_kwargs(runtime):\n    return {}\n", *module.PATCHES[NAME])


class Capture(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.captured.append(body)
        self.server.captured_headers.append(dict(self.headers))
        reply = {"id": "msg_probe", "type": "message", "role": "assistant", "model": body["model"],
                 "content": [{"type": "text", "text": "ready"}], "stop_reason": "end_turn", "stop_sequence": None,
                 "usage": {"input_tokens": 1, "output_tokens": 1}}
        if body.get('stream'):
            events = [
                ('message_start', {'type': 'message_start', 'message': {**reply, 'content': [], 'stop_reason': None}}),
                ('content_block_start', {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}}),
                ('content_block_delta', {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': 'ready'}}),
                ('content_block_stop', {'type': 'content_block_stop', 'index': 0}),
                ('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn', 'stop_sequence': None}, 'usage': {'output_tokens': 1}}),
                ('message_stop', {'type': 'message_stop'}),
            ]
            payload = ''.join(f'event: {name}\ndata: {json.dumps(data)}\n\n' for name, data in events).encode()
        else:
            payload = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream" if body.get('stream') else "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


def assert_gateway_output_on_wire(tmp_path, monkeypatch):
    """Real pinned constructor, adapter and SDK; only the provider is a loopback capture."""
    pytest.importorskip("hermes_constants", reason="Needs the pinned engine interpreter")
    import yaml

    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("OPENDUET_MODEL_KEY", "openduet-surrogate-probe")
    # The engine prepends its checkout to sys.path; exercise this change's
    # support module rather than an older copy previously installed there.
    hooks_spec = importlib.util.spec_from_file_location("openduet_runtime_hooks", PACKAGE / "runtime_support" / "openduet_runtime_hooks.py")
    hooks = importlib.util.module_from_spec(hooks_spec)
    monkeypatch.setitem(sys.modules, "openduet_runtime_hooks", hooks)
    hooks_spec.loader.exec_module(hooks)
    from agent.anthropic_adapter import build_anthropic_kwargs
    from run_agent import AIAgent
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Capture)
    server.captured = []
    server.captured_headers = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}/providers/anthropic/v1"
    monkeypatch.setenv("OPENDUET_BROKER_URL", f"http://127.0.0.1:{server.server_port}")
    monkeypatch.setenv("OPENDUET_ATTEMPT_TOKEN", "attempt-capability")
    try:
        config = yaml.safe_load((PACKAGE / "config" / "config.yaml").read_text())
        config["model"].update({"default": "claude-opus-5-5", "max_tokens": 512,
                                "extra_headers": {"x-openduet-clamp-output": "1"}})
        config["providers"]["openduet-gateway"].update({"base_url": base, "default_model": "claude-opus-5-5"})
        (home / "config.yaml").write_text(yaml.safe_dump(config))
        module = bridge()
        actual = constructor(module.patched(engine_source(), *module.PATCHES[NAME]))
        runtime = {"api_key": "openduet-surrogate-probe", "base_url": base, "provider": "custom",
                   "requested_provider": "openduet-gateway", "api_mode": "anthropic_messages"}
        agent = AIAgent(model="claude-opus-5-5", enabled_toolsets=[], quiet_mode=True,
                        skip_context_files=True, skip_memory=True, max_iterations=1, **actual(runtime))
        assert agent.max_tokens == 512
        wire = build_anthropic_kwargs(model=agent.model, messages=[{"role": "user", "content": "Reply ready"}],
                                     tools=None, max_tokens=agent.max_tokens, reasoning_config=agent.reasoning_config,
                                     base_url=base)
        agent._anthropic_client.messages.create(**wire)
        assert len(server.captured) == 1
        assert server.captured[0]["max_tokens"] == 512
        headers = {name.lower(): value for name, value in server.captured_headers[0].items()}
        assert headers["x-openduet-capability"] == "attempt-capability"
        assert headers["x-openduet-clamp-output"] == "1"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_gateway_constructed_anthropic_agent_sends_the_configured_ceiling_on_the_wire(tmp_path, monkeypatch):
    assert_gateway_output_on_wire(tmp_path, monkeypatch)


@pytest.mark.parametrize('ceiling', [512, None])
def test_native_compaction_auxiliary_call_uses_only_an_explicit_gateway_ceiling(tmp_path, monkeypatch, ceiling):
    """Real compressor -> auxiliary resolver -> native adapter -> Anthropic SDK wire."""
    pytest.importorskip('hermes_constants', reason='Needs the pinned engine interpreter')
    import yaml

    home = tmp_path / 'home'
    home.mkdir()
    monkeypatch.setenv('HERMES_HOME', str(home))
    monkeypatch.setenv('OPENDUET_MODEL_KEY', 'openduet-surrogate-probe')
    monkeypatch.setenv('OPENDUET_ATTEMPT_TOKEN', 'attempt-capability')
    hooks_spec = importlib.util.spec_from_file_location('openduet_runtime_hooks', PACKAGE / 'runtime_support' / 'openduet_runtime_hooks.py')
    hooks = importlib.util.module_from_spec(hooks_spec)
    monkeypatch.setitem(sys.modules, 'openduet_runtime_hooks', hooks)
    hooks_spec.loader.exec_module(hooks)
    from agent import auxiliary_client
    from agent.context_compressor import ContextCompressor

    # Execute the reviewed source seam in memory; never modify the live checkout.
    module = bridge()
    source = module.patched(engine_source(AUX_NAME), *module.PATCHES[AUX_NAME])
    cls = next(node for node in ast.parse(source).body if isinstance(node, ast.ClassDef) and node.name == '_AnthropicCompletionsAdapter')
    create = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'create')
    scope = dict(auxiliary_client.__dict__)
    exec(compile(ast.Module(body=[create], type_ignores=[]), AUX_NAME, 'exec'), scope)
    monkeypatch.setattr(auxiliary_client._AnthropicCompletionsAdapter, 'create', scope['create'])

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Capture)
    server.captured, server.captured_headers = [], []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    broker = f'http://127.0.0.1:{server.server_port}'
    base = broker + '/providers/anthropic/v1'
    monkeypatch.setenv('OPENDUET_BROKER_URL', broker)
    try:
        config = yaml.safe_load((PACKAGE / 'config' / 'config.yaml').read_text())
        config['model'].update({'default': 'claude-opus-5-5'})
        if ceiling is not None:
            config['model'].update({'max_tokens': ceiling, 'extra_headers': {'x-openduet-clamp-output': '1'}})
        else:
            config['model'].pop('max_tokens', None)
            config['model'].pop('extra_headers', None)
        config['providers']['openduet-gateway'].update({
            'base_url': base, 'default_model': 'claude-opus-5-5', 'api_mode': 'anthropic_messages',
        })
        (home / 'config.yaml').write_text(yaml.safe_dump(config))
        compressor = ContextCompressor(model='claude-opus-5-5', base_url=base,
                                       api_key='openduet-surrogate-probe', provider='openduet-gateway',
                                       api_mode='anthropic_messages', quiet_mode=True, config_context_length=1_000_000)
        assert compressor._call_summary_llm('Summarize the supplied conversation.', time.monotonic()) == 'ready'
        assert len(server.captured) == 1
        assert server.captured[0]['max_tokens'] == (ceiling if ceiling is not None else 128_000)
        headers = {name.lower(): value for name, value in server.captured_headers[0].items()}
        assert headers['x-openduet-capability'] == 'attempt-capability'
        assert headers.get('x-openduet-clamp-output') == ('1' if ceiling is not None else None)
        # A caller's explicit auxiliary limit is left exact, including when configured.
        client, model = auxiliary_client.resolve_provider_client(provider='openduet-gateway', task='compression')
        client.chat.completions.create(model=model, messages=[{'role': 'user', 'content': 'Summarize.'}], max_tokens=256)
        assert len(server.captured) == 2
        assert server.captured[1]['max_tokens'] == 256
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
