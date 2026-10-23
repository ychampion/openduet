"""Browser proof of collaborative suggestions, using isolated Sample day data.

Suggestion/settings persistence is simulated per disposable browser context;
real production persistence and source boundaries are checked by assistant-pulse.test.ts.
Context preparation reaches the actual local Sample day endpoint. No task is sent.
"""
import copy
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
WEB, API = "http://127.0.0.1:5321", "http://127.0.0.1:3321"
MEDIA, OUT = ROOT / "docs/media/sample-day", ROOT / "output/product"
KEY = "openduet.first-handoff.v1"
MEDIA.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(API + "/assistant") as response:
    fixture = json.load(response)
report = {"checked_at": datetime.now(timezone.utc).isoformat(), "checks": [],
          "page_errors": [], "submissions": [], "scripted_settings_persistence": True,
          "real_sample_context_endpoint": True, "live_provider": False}


def check(page, label):
    expect(page.get_by_role("region", name="Sample day", exact=True)).to_be_visible()
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), label
    report["checks"].append(label)


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for name, width, height, theme in [
            ("desktop", 1440, 1000, "light"), ("phone", 390, 844, "light"),
            ("dark", 1440, 1000, "dark"), ("phone-dark", 390, 844, "dark"),
            ("narrow", 320, 760, "light")]:
            state = {"view": copy.deepcopy(fixture), "capture": True}
            context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=theme)

            def intercept(route):
                request = route.request
                path = urlparse(request.url).path
                view = state["view"]
                if path == "/assistant" and request.method == "GET" and state.pop("defer_next", False):
                    state["pending"] = (route, copy.deepcopy(view))
                    return
                if path == "/assistant" and request.method in {"GET", "PATCH"}:
                    if request.method == "PATCH":
                        view["enabled"] = request.post_data_json["enabled"]
                        view["status"] = "watching" if view["enabled"] else "paused"
                    route.fulfill(json={**view, "suggestions": view["suggestions"] if view["enabled"] else []})
                elif re.fullmatch(r"/assistant/suggestions/[^/]+", path) and request.method == "POST":
                    view["suggestions"] = []
                    route.fulfill(json=view)
                elif path == "/memory/settings":
                    if request.method == "PUT":
                        state["capture"] = request.post_data_json["capture"]
                    route.fulfill(json={"capture": state["capture"]})
                elif path.endswith("/messages") and request.method == "POST":
                    report["submissions"].append(path)
                    route.fulfill(status=409, json={"error": {"message": "Browser proof sends no work."}})
                else:
                    route.continue_()

            context.route(API + "/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
            page.goto(WEB + "/#/", wait_until="networkidle")
            pulse = page.get_by_role("region", name="Your collaborative assistant")
            expect(pulse.get_by_role("button", name="Plan together", exact=True)).to_be_visible()
            expect(pulse).to_contain_text("Sample day · supplied call notes")
            page.evaluate("document.fonts.ready")
            page.screenshot(path=str(MEDIA / f"proactive-{name}.png"))
            check(page, name + ": suggestion, reason and source visible")
            summary = pulse.locator("summary")
            summary.focus()
            page.keyboard.press("Enter")
            expect(pulse.get_by_role("button", name="Pause suggestions")).to_be_visible()
            check(page, name + ": keyboard opens presence controls")
            if name == "desktop":
                page.screenshot(path=str(MEDIA / "proactive-memory.png"))
            pulse.get_by_role("button", name="Pause suggestions").click()
            expect(summary).to_contain_text("Suggestions paused")
            page.reload(wait_until="networkidle")
            expect(pulse.locator("summary")).to_contain_text("Suggestions paused")
            pulse.locator("summary").click()
            pulse.get_by_role("button", name="Resume suggestions").click()
            expect(pulse.get_by_role("button", name="Plan together", exact=True)).to_be_visible()
            check(page, name + ": pause persists through refresh and resume restores suggestions")
            learning = pulse.get_by_role("checkbox", name="Learn lasting facts and preferences automatically")
            learning.click()
            expect(summary).to_contain_text("Automatic learning paused")
            page.reload(wait_until="networkidle")
            expect(summary).to_contain_text("Automatic learning paused")
            summary.click()
            learning.click()
            expect(summary).to_contain_text("Automatic memory on")
            summary.click()
            check(page, name + ": memory capture choice persists and can be restored")
            composer = page.locator("textarea").first
            composer.fill("Keep my existing unsent request exactly.")
            pulse.get_by_role("button", name="Plan together", exact=True).click()
            expect(page.get_by_text("Finish or clear your current request first.", exact=False)).to_be_visible()
            expect(composer).to_have_value("Keep my existing unsent request exactly.")
            check(page, name + ": collaboration preserves existing input")
            composer.fill("")
            pulse.get_by_role("button", name="Plan together", exact=True).click()
            expect(composer).to_have_value(re.compile("Next relevant task:"))
            assert "starter=" in page.url
            kept = page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)
            assert len(kept["attachments"]) == 1 and not kept.get("attempted")
            page.reload(wait_until="networkidle")
            expect(composer).to_have_value(kept["text"])
            refreshed = page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)
            assert refreshed["attachments"] == kept["attachments"]
            assert refreshed["id"] == kept["id"] and not refreshed.get("attempted")
            check(page, name + ": context and unsent request survive refresh without submitting")
            if name == "desktop":
                page.screenshot(path=str(MEDIA / "proactive-plan.png"))
            pulse.get_by_role("button", name="Tomorrow", exact=True).click()
            expect(pulse.get_by_role("button", name="Plan together", exact=True)).to_have_count(0)
            page.reload(wait_until="networkidle")
            expect(pulse.get_by_role("button", name="Plan together", exact=True)).to_have_count(0)
            check(page, name + ": tomorrow removes suggestion through refresh")
            state["view"]["suggestions"] = copy.deepcopy(fixture["suggestions"])
            page.reload(wait_until="networkidle")
            pulse.get_by_role("button", name="Not useful", exact=True).click()
            page.reload(wait_until="networkidle")
            expect(pulse.get_by_role("button", name="Plan together", exact=True)).to_have_count(0)
            check(page, name + ": dismissal removes suggestion through refresh")
            context.close()
        with urllib.request.urlopen(API + "/personal-session") as response:
            task = next(ref for ref in json.load(response)["session"]["references"] if ref["kind"] == "conversation")
        state = {"view": copy.deepcopy(fixture), "capture": True}
        state["view"]["suggestions"][0].update(kind="task", conversation_id=task["conversation_id"], context=task["title"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.route(API + "/**", intercept)
        page = context.new_page()
        page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
        page.goto(WEB + "/#/", wait_until="networkidle")
        pulse = page.get_by_role("region", name="Your collaborative assistant")
        page.evaluate("""key => {
            const original = Storage.prototype.setItem;
            Storage.prototype.setItem = function(name, value) {
                if (name === key) throw new Error('Fixture storage is blocked');
                return original.call(this, name, value);
            };
        }""", KEY)
        pulse.get_by_role("button", name="Plan together", exact=True).click()
        expect(page.get_by_text("Fixture storage is blocked", exact=True)).to_be_visible()
        expect(page.locator("textarea").first).to_have_value("")
        check(page, "storage failure is visible and leaves the composer unchanged")
        page.reload(wait_until="networkidle")
        pulse.get_by_role("button", name="Plan together", exact=True).click()
        expect(page.locator("textarea").first).to_have_value(re.compile("Next relevant task:"))
        kept = page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)
        assert kept["target"] == {"kind": "continue_task", "conversation_id": task["conversation_id"]}
        page.reload(wait_until="networkidle")
        restored = page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)
        assert restored["target"] == kept["target"] and not restored.get("attempted")
        check(page, "stalled-task collaboration retains its exact target through refresh")
        context.close()
        state = {"view": copy.deepcopy(fixture), "capture": True}
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.route(API + "/**", intercept)
        page = context.new_page()
        page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
        page.goto(WEB + "/#/", wait_until="networkidle")
        pulse = page.get_by_role("region", name="Your collaborative assistant")
        pulse.locator("summary").click()
        state["defer_next"] = True
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        deadline = time.monotonic() + 5
        while "pending" not in state and time.monotonic() < deadline:
            page.wait_for_timeout(20)
        assert "pending" in state
        pulse.get_by_role("button", name="Pause suggestions").click()
        expect(pulse.locator("summary")).to_contain_text("Suggestions paused")
        pending, old_view = state["pending"]
        with page.expect_request_finished(lambda request: request.method == "GET" and urlparse(request.url).path == "/assistant"):
            pending.fulfill(json=old_view)
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        expect(pulse.locator("summary")).to_contain_text("Suggestions paused")
        expect(pulse.get_by_role("button", name="Plan together", exact=True)).to_have_count(0)
        check(page, "a delayed read cannot undo a successful pause")
        context.close()
        assert not report["submissions"]
        assert not report["page_errors"]
        browser.close()
    report["status"] = "passed"
finally:
    (OUT / "assistant-browser-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"status": report["status"], "checks": len(report["checks"]),
                  "submissions": report["submissions"], "page_errors": report["page_errors"]}))
