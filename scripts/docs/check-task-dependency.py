"""Read-only browser proof of source-bound recovery; repair and upload responses are scripted.

Uses production components and existing Sample day GETs. Every API mutation is
intercepted, so this script never modifies the shared sample fixture or sends work.
"""
import argparse
import copy
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
KEY = "openduet.first-handoff.v1"
REQUEST = "  Prepare another task.\n\nKeep café and £ exactly. Do not send.  "
CONTEXT = "Pasted call notes: SSO remains unconfirmed.\nPrepare only; do not send."
FILE_ID = "file_scripted_dependency_notes"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", default="http://127.0.0.1:5321")
    parser.add_argument("--api", default="http://127.0.0.1:3321")
    parser.add_argument("--out", type=Path, default=ROOT / "output/product/task-dependency-browser-report.json")
    args = parser.parse_args()
    for address in [args.web, args.api]:
        if urlparse(address).hostname not in {"127.0.0.1", "localhost", "::1"}:
            parser.error("Only isolated local Sample day servers are supported.")
    args.out.parent.mkdir(parents=True, exist_ok=True)

    def read(path):
        with urllib.request.urlopen(args.api + path) as response:
            return json.load(response)

    session = read("/personal-session")
    original = next(r for r in session["session"]["references"] if r["kind"] == "conversation")
    reference = {**original, "status": "needs_you"}
    session["session"]["references"] = [reference]
    connections = read("/experience/connections")
    source = connections["connections"][0]
    source["label"] = "Client Gmail"
    unrelated = {**source, "id": "conn_scripted_unrelated", "label": "Private Calendar", "status": "error"}
    connections["connections"].append(unrelated)
    action = {
        "id": "act_scripted_reconnect", "job_id": reference["conversation_id"],
        "connection_id": source["id"], "status": "failed",
        "repair_disposition": "needs_reconnect", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    state = {"show_fault": False}
    report = {
        "status": "running", "checked_at": datetime.now(timezone.utc).isoformat(),
        "disposable_browser_context": True,
        "scripted_task_repair_and_upload": True,
        "shared_fixture_mutations": 0,
        "limitations": [
            "A recorded needs_reconnect action response is scripted; this is a UI recovery proof, not a live credential revocation test.",
            "Supported .txt upload response is scripted; actual upload and atomic submission were verified by check-handoff.py.",
            "Connect opens the existing Connections screen; the script does not sign in to any source.",
        ],
        "checks": [], "page_errors": [], "blocked_mutations": [], "message_submissions": [],
        "task_id": reference["conversation_id"], "action": action,
    }

    def intercept(route):
        request = route.request
        path = urlparse(request.url).path
        if request.method == "GET" and path == "/personal-session":
            route.fulfill(json=session)
        elif request.method == "GET" and path == "/experience/connections":
            route.fulfill(json=connections)
        elif request.method == "GET" and path == "/actions":
            job = parse_qs(urlparse(request.url).query).get("job_id", [None])[0]
            route.fulfill(json={"actions": [action] if state["show_fault"] and job == reference["conversation_id"] else []})
        elif request.method == "POST" and path == "/attachments":
            route.fulfill(status=201, json={"attachment": {
                "id": FILE_ID, "name": "Recovery notes.txt", "media_type": "text/plain",
                "kind": "text", "size": 25, "pages": None,
                "has_preview": False, "has_text": True, "created_at": datetime.now(timezone.utc).isoformat(),
            }})
        elif request.method == "PATCH" and path == "/personal-session/read":
            report["blocked_mutations"].append({"path": path, "body": request.post_data_json})
            route.fulfill(json=session)
        elif request.method not in {"GET", "HEAD", "OPTIONS"}:
            entry = {"path": path, "method": request.method, "body": request.post_data}
            report["blocked_mutations"].append(entry)
            if path == "/personal-session/messages" or path.endswith("/messages"):
                report["message_submissions"].append(entry)
            route.fulfill(status=409, json={"error": {"message": "Read-only recovery proof: no mutation performed."}})
        else:
            route.continue_()

    def kept(page):
        return page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            context.route(args.api + "/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
            try:
                page.goto(args.web + "/#/", wait_until="domcontentloaded")
                expect(page.get_by_role("region", name="Sample day", exact=True)).to_be_visible()
                assert page.evaluate("document.documentElement.dataset.sampleDay") == "true"
                expect(page.get_by_text(reference["title"], exact=True).first).to_be_visible()
                expect(page.locator(".personal-compose textarea")).to_be_visible()
                expect(page.get_by_role("region", name="Missing task source")).to_have_count(0)
                report["checks"].append("An unrelated disconnected Calendar does not manufacture a task prerequisite.")

                state["show_fault"] = True
                page.reload(wait_until="domcontentloaded")
                recovery = page.get_by_role("region", name="Missing task source", exact=True)
                expect(recovery).to_have_count(1)
                expect(recovery.get_by_text("Client Gmail needs reconnecting for this task", exact=True)).to_be_visible()
                expect(recovery).not_to_contain_text("Private Calendar")
                report["checks"].append("The actual recovery component names only the connection on the task's failed needs_reconnect record.")

                composer = page.locator(".personal-compose textarea")
                composer.fill(REQUEST)
                page.locator(".personal-compose").get_by_test_id("attach-input").set_input_files({
                    "name": "Recovery notes.txt", "mimeType": "text/plain", "buffer": b"Use these supplied notes.",
                })
                expect(page.locator('.personal-compose .attach-tile[data-state="ready"]')).to_have_count(1)
                with context.expect_page() as popup_info:
                    recovery.get_by_role("button", name="Connect", exact=True).click()
                popup = popup_info.value
                popup.wait_for_url("**/#/settings/connections")
                popup.close()
                original_draft = copy.deepcopy(kept(page))
                assert original_draft["text"] == REQUEST
                assert original_draft["attachments"] == [FILE_ID]
                assert original_draft["target"] == {"kind": "new_task"}
                assert not original_draft["attempted"]
                page.reload(wait_until="domcontentloaded")
                expect(page.locator(".personal-compose textarea")).to_have_value(REQUEST)
                assert kept(page) == original_draft
                assert report["message_submissions"] == []
                report["checks"].append("Connect opens source setup while exact unsent text and supported-file ID survive refresh without a submission.")

                page.locator(".personal-result-actions").get_by_role("button", name=re.compile(r"^(Edit draft|Continue task)$")).click()
                page.wait_for_function("key => JSON.parse(localStorage.getItem(key))?.target?.kind === 'continue_task'", arg=KEY)
                assert kept(page)["target"]["conversation_id"] == reference["conversation_id"]
                assert kept(page)["attachments"] == [FILE_ID]
                page.locator(".personal-compose").get_by_role("button", name="New task", exact=True).click()
                page.wait_for_function("key => JSON.parse(localStorage.getItem(key))?.target?.kind === 'new_task'", arg=KEY)
                assert kept(page) == original_draft
                assert report["message_submissions"] == []
                report["checks"].append("Choosing a task and returning to New task keeps the same unsent key, exact context and file IDs without submitting.")

                page.get_by_role("region", name="Missing task source", exact=True).get_by_role("button", name="Provide context", exact=True).click()
                inspector = page.get_by_role("dialog", name=reference["title"], exact=True)
                expect(inspector).to_be_visible()
                expect(inspector.locator("textarea")).to_have_count(1)
                inspector.locator("textarea").fill(CONTEXT)
                expect(inspector.locator("textarea")).to_have_value(CONTEXT)
                expect(inspector.get_by_test_id("attach-input")).to_have_count(1)
                assert kept(page) == original_draft
                assert report["message_submissions"] == []
                report["checks"].append("Provide context opens only the recorded task's real notes/file composer, preserves the separate unsent request, and sends nothing.")
                assert not report["page_errors"], report["page_errors"]
                report["status"] = "passed"
            finally:
                context.close()
                browser.close()
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        raise
    finally:
        args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "checks": len(report["checks"]), "report": str(args.out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
