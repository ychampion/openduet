"""Record actual local Sample day collaboration; no model, account or task send."""
from pathlib import Path
import re
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/product"
OUT.mkdir(parents=True, exist_ok=True)
submissions = []
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000},
        record_video_dir=str(OUT / "recordings"), record_video_size={"width": 1440, "height": 1000})
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))

    def no_send(route):
        if route.request.method == "POST" and route.request.url.endswith("/messages"):
            submissions.append(route.request.url)
            route.fulfill(status=409, json={"error": {"message": "Recording sends no task."}})
        else:
            route.continue_()

    context.route("http://127.0.0.1:3321/**", no_send)
    page.goto("http://127.0.0.1:5321/#/", wait_until="networkidle")
    pulse = page.get_by_role("region", name="Your collaborative assistant")
    expect(pulse.get_by_role("button", name="Plan together", exact=True)).to_be_visible()
    page.wait_for_timeout(2300)
    pulse.locator("summary").click()
    page.wait_for_timeout(3300)
    pulse.locator("summary").click()
    page.wait_for_timeout(700)
    pulse.get_by_role("button", name="Plan together", exact=True).click()
    composer = page.locator("textarea").first
    expect(composer).not_to_be_empty()
    page.wait_for_timeout(3300)
    composer.fill(composer.input_value() + " Keep the first agenda to three questions.")
    page.wait_for_timeout(2300)
    page.reload(wait_until="networkidle")
    expect(composer).to_have_value(re.compile("Keep the first agenda"))
    page.wait_for_timeout(2600)
    expect(page.get_by_role("region", name="Sample day", exact=True)).to_be_visible()
    video = page.video
    context.close()
    video.save_as(str(OUT / "assistant-collaboration.webm"))
    browser.close()
assert not submissions and not errors, (submissions, errors)
print("Recorded labeled sample collaboration, zero submitted tasks and page errors.")
