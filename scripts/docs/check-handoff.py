"""Prove first-task recovery with real sample uploads and scripted model readiness.

Run the isolated Sample day UI/API first. This script never uses a real model or
account. Profile changes are intercepted inside a disposable browser context;
uploads and the one actual task submission reach the local sample API.
"""

import argparse
import copy
import hashlib
import json
import sys
import traceback
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
KEY = "openduet.first-handoff.v1"
RAW_REQUEST = (
    "  Prepare a follow-up draft from my attached notes.\n"
    'Keep the exact customer quote: "Ship on Tuesday?"\n\n'
    "Context: café launch; budget £1,250. Draft only — ask before sending.  "
)
FILES = [
    {
        "name": "handoff-notes.txt",
        "mimeType": "text/plain",
        "buffer": b"Customer: Northstar. Promise: share a launch checklist on Tuesday.\n",
    },
    {
        "name": "handoff-extra.csv",
        "mimeType": "text/csv",
        "buffer": b"item,owner\nLaunch checklist,Avery\n",
    },
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", default="http://127.0.0.1:5321")
    parser.add_argument("--api", default="http://127.0.0.1:3321")
    parser.add_argument(
        "--out", type=Path, default=ROOT / "output/product/handoff-browser-report.json"
    )
    args = parser.parse_args()
    for address in [args.web, args.api]:
        if urlparse(address).hostname not in {"127.0.0.1", "localhost", "::1"}:
            parser.error("This proof is restricted to the isolated local Sample day servers.")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "running",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "web": args.web,
        "api": args.api,
        "disposable_browser_context": True,
        "scripted_readiness": True,
        "scripted_profile": True,
        "live_provider": False,
        "real_sample_api_uploads_and_submission": True,
        "limitations": [
            "Readiness is a scripted missing-to-verified transition for the exact selected model.",
            "This proves the browser handoff; actual model tool checks are verified separately.",
            "The local sample API produces scripted task results; no real account action occurs.",
        ],
        "checks": [],
        "page_errors": [],
        "uploads": [],
        "submissions": [],
        "profile_updates": [],
    }

    def passed(label):
        report["checks"].append(label)

    def read(path):
        with urllib.request.urlopen(args.api + path) as response:
            return json.loads(response.read())

    settings = read("/model-settings")
    profile = read("/profile")["profile"]
    profile["onboarded"] = False
    state = {"ready": False, "profile": profile}

    def model_settings():
        value = copy.deepcopy(settings)
        value["active"]["connected"] = state["ready"]
        value["readiness"] = (
            {
                "provider": value["active"]["provider"],
                "model": value["active"]["model"],
                "credentials": "passed",
                "inference": "passed",
                "tools": "passed",
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
            if state["ready"]
            else None
        )
        for provider in value["providers"]:
            if provider["provider"] == value["active"]["provider"]:
                provider["connected"] = state["ready"]
        return value

    def intercept(route):
        request = route.request
        path = urlparse(request.url).path
        if path == "/model-settings" and request.method == "GET":
            route.fulfill(json=model_settings())
        elif path == "/profile" and request.method == "GET":
            route.fulfill(json={"profile": state["profile"]})
        elif path == "/profile" and request.method == "PATCH":
            update = request.post_data_json
            report["profile_updates"].append(update)
            state["profile"] = {**state["profile"], **update}
            route.fulfill(json={"profile": state["profile"]})
        elif path == "/attachments" and request.method == "POST":
            response = route.fetch()
            report["uploads"].append(
                {"status": response.status, "attachment": response.json().get("attachment")}
            )
            route.fulfill(response=response)
        elif path == "/personal-session/messages" and request.method == "POST":
            response = route.fetch()
            report["submissions"].append(
                {
                    "status": response.status,
                    "idempotency_key": request.headers.get("idempotency-key"),
                    "body": request.post_data_json,
                    "acceptance": response.json(),
                }
            )
            route.fulfill(response=response)
        else:
            route.continue_()

    def draft(page):
        return page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1440, "height": 1000}, timezone_id="Asia/Kolkata"
            )
            context.route(args.api + "/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
            try:
                page.goto(args.web + "/#/setup", wait_until="networkidle")
                expect(page.get_by_role("region", name="Sample day", exact=True)).to_be_visible()
                assert page.evaluate("document.documentElement.dataset.sampleDay") == "true"
                expect(
                    page.get_by_role("heading", name="What would you like off your plate?", exact=True)
                ).to_be_visible()
                expect(page.get_by_text("Your request will be kept through model setup.")).to_be_visible()
                passed("A clearly labeled Sample day opens the real first-task invitation with no model.")

                box = page.get_by_role("textbox", name="Paste your task, notes, or context…", exact=True)
                box.fill(RAW_REQUEST)
                page.get_by_role("button", name="Change", exact=True).click()
                page.get_by_role("combobox", name="Time zone", exact=True).select_option(
                    "America/New_York"
                )
                page.get_by_test_id("attach-input").set_input_files(FILES)
                expect(page.locator('.attach-tile[data-state="ready"]')).to_have_count(2)
                expect(page.get_by_role("button", name="Send", exact=True)).to_be_enabled()
                assert len(report["uploads"]) == 2, report["uploads"]
                assert all(upload["status"] < 300 for upload in report["uploads"])
                uploaded = {
                    upload["attachment"]["name"]: upload["attachment"]["id"]
                    for upload in report["uploads"]
                }
                assert set(uploaded) == {file["name"] for file in FILES}
                page.get_by_role("button", name="Send", exact=True).click()
                expect(
                    page.get_by_role("region", name="Connect a model for your saved task", exact=True)
                ).to_be_visible()
                original = draft(page)
                assert original["text"] == RAW_REQUEST
                assert original["attachments"] == [uploaded[file["name"]] for file in FILES]
                assert original["timeZone"] == "America/New_York"
                assert original["attempted"] is False
                assert not report["submissions"] and not report["profile_updates"]
                report["draft_id"] = original["id"]
                report["raw_request"] = RAW_REQUEST
                report["raw_request_sha256"] = hashlib.sha256(RAW_REQUEST.encode()).hexdigest()
                report["saved_before_setup"] = original
                passed("Real uploaded file IDs and raw task text are saved before model setup; nothing is submitted.")

                page.reload(wait_until="networkidle")
                expect(box).to_have_value(RAW_REQUEST)
                expect(page.get_by_text("Time zone: America/New_York", exact=True)).to_be_visible()
                assert draft(page) == original
                passed("Refresh during missing-model setup restores the exact request, attachment IDs, and stable key.")
                passed("A chosen request zone survives refresh instead of reverting to the browser or profile zone.")

                # A write failure must remain visible and must not hide an included file.
                page.evaluate(
                    """key => {
                      window.__handoffSetItem = Storage.prototype.setItem;
                      Storage.prototype.setItem = function(k, value) {
                        if (k === key) throw new Error('Scripted storage write refused');
                        return window.__handoffSetItem.call(this, k, value);
                      };
                    }""",
                    KEY,
                )
                extra = page.get_by_text("handoff-extra.csv", exact=True).locator("..")
                extra.get_by_role("button", name="Remove", exact=True).click()
                expect(page.get_by_role("alert")).to_contain_text("Scripted storage write refused")
                expect(page.get_by_text("handoff-extra.csv", exact=True)).to_be_visible()
                assert draft(page) == original
                page.evaluate("() => { Storage.prototype.setItem = window.__handoffSetItem; }")
                passed("A storage failure shows an error and keeps the still-included attachment visible.")

                extra.get_by_role("button", name="Remove", exact=True).click()
                expect(page.get_by_text("handoff-extra.csv", exact=True)).to_have_count(0)
                revised = draft(page)
                assert revised["attachments"] == [uploaded["handoff-notes.txt"]]
                assert revised["attachmentNames"] == ["handoff-notes.txt"]
                assert revised["text"] == RAW_REQUEST and revised["id"] == original["id"]
                page.reload(wait_until="networkidle")
                expect(box).to_have_value(RAW_REQUEST)
                expect(page.get_by_text("handoff-extra.csv", exact=True)).to_have_count(0)
                expect(page.get_by_text("handoff-notes.txt", exact=True)).to_be_visible()
                assert draft(page) == revised
                report["saved_after_remove_and_refresh"] = revised
                passed("Removing a kept attachment persists before hiding it and survives a second refresh.")

                page.get_by_role("button", name="Change", exact=True).click()
                page.get_by_role("combobox", name="Time zone", exact=True).select_option(
                    "Europe/London"
                )
                revised = draft(page)
                assert revised["timeZone"] == "Europe/London"
                page.reload(wait_until="networkidle")
                expect(page.get_by_text("Time zone: Europe/London", exact=True)).to_be_visible()
                assert draft(page) == revised
                report["saved_after_zone_change_and_refresh"] = revised
                passed("Changing the zone of an already saved request persists immediately and survives another refresh.")

                page.get_by_role("button", name="Send", exact=True).click()
                expect(
                    page.get_by_role("region", name="Connect a model for your saved task", exact=True)
                ).to_be_visible()
                assert draft(page)["id"] == original["id"]
                assert not report["submissions"] and not report["profile_updates"]
                page.screenshot(path=str(args.out.parent / "handoff-missing-model.png"), full_page=True)
                passed("Continuing a restored draft while the model is missing retains its original key.")

                state["ready"] = True
                report["scripted_selected_model"] = model_settings()["readiness"]
                # Repeated readiness signals share one synchronous in-flight guard.
                page.evaluate(
                    """() => {
                      window.dispatchEvent(new CustomEvent('openduet:model-ready'));
                      window.dispatchEvent(new CustomEvent('openduet:model-ready'));
                    }"""
                )
                page.wait_for_url("**/#/chat/**")
                expect(page.get_by_role("link", name="Explore", exact=True).first).to_be_visible()
                expect(
                    page.get_by_text("Prepare a follow-up draft from my attached notes.", exact=False).last
                ).to_be_visible()
                assert len(report["submissions"]) == 1, report["submissions"]
                submission = report["submissions"][0]
                assert submission["status"] < 300, submission
                assert submission["idempotency_key"] == original["id"]
                assert submission["body"] == {
                    "target": {"kind": "new_task"},
                    "text": RAW_REQUEST,
                    "attachments": [uploaded["handoff-notes.txt"]],
                    "time_zone": revised["timeZone"],
                }
                assert len(report["profile_updates"]) == 1, report["profile_updates"]
                assert report["profile_updates"][0]["onboarded"] is True
                assert report["profile_updates"][0]["time_zone"] == "Europe/London"
                assert draft(page) is None
                passed("Repeated scripted model-ready events create exactly one task with the original raw request and remaining file ID.")
                passed("Account completion performs one profile update without adding a synthetic profile message.")

                # Chat keeps a live updates stream open; wait for rendered task
                # content rather than treating an idle connection as readiness.
                page.reload(wait_until="domcontentloaded")
                expect(page.get_by_role("link", name="Explore", exact=True).first).to_be_visible()
                expect(
                    page.get_by_text("Prepare a follow-up draft from my attached notes.", exact=False).last
                ).to_be_visible()
                assert len(report["submissions"]) == 1
                assert len(report["profile_updates"]) == 1
                assert not report["page_errors"], report["page_errors"]
                turns = read(
                    "/conversations/" + submission["acceptance"]["conversation_id"] + "/messages"
                )["turns"]
                assert len(turns) == 1, turns
                assert turns[0]["text"] == RAW_REQUEST
                assert [file["id"] for file in turns[0]["attachments"]] == [
                    uploaded["handoff-notes.txt"]
                ]
                report["persisted_turn"] = turns[0]
                page.screenshot(path=str(args.out.parent / "handoff-accepted.png"), full_page=True)
                report["final_url"] = page.url
                passed("Refreshing the accepted task does not replay its first submission or profile completion.")
                report["status"] = "passed"
            finally:
                context.close()
                browser.close()
    except Exception as error:
        report["status"] = "failed"
        report["failure"] = str(error)
        report["traceback"] = traceback.format_exc()
        raise
    finally:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
