"""Capture the real web UI against local, explicitly scripted documentation fixtures."""
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / 'docs' / 'media'
RAW = ROOT / 'output' / 'docs' / 'recordings'
MEDIA.mkdir(parents=True, exist_ok=True)
RAW.mkdir(parents=True, exist_ok=True)
WEB = 'http://127.0.0.1:5320'
META = json.load(urlopen('http://127.0.0.1:3320/docs-metadata'))
META['followup'] = json.load(urlopen(Request('http://127.0.0.1:3320/conversations',
    data=json.dumps({'title': 'Northstar proposal follow-up'}).encode(),
    headers={'content-type': 'application/json'}, method='POST')))['conversation']['id']
PROMPT = 'Read the Northstar proposal thread. Draft a short follow-up asking about next steps. Let me review it before sending.'
checks = []

def ready(page, route):
    # Conversations keep an event stream open; network-idle is not a readiness signal.
    page.goto(f'{WEB}/#{route}', wait_until='domcontentloaded')
    page.get_by_role('link', name='Home', exact=True).wait_for()
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(1200)

def annotation(page):
    # A visible recording caption; the application UI and its responses are unchanged.
    page.evaluate('''() => {
      const label = document.createElement('div');
      label.textContent = 'Scripted UI walkthrough · Sample data · No external actions';
      label.style.cssText = 'position:fixed;bottom:8px;right:20px;z-index:99999;background:#141413;color:#faf9f5;padding:6px 12px;border-radius:6px;font:12px sans-serif;pointer-events:none';
      document.body.append(label);
    }''')

def check(page, name):
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), name
    assert page.locator('img').evaluate_all('xs => xs.every(x => x.complete && x.naturalWidth > 0)'), name
    checks.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    context = browser.new_context(viewport={'width': 1440, 'height': 960}, color_scheme='light',
                                  record_video_dir=str(RAW), record_video_size={'width': 1440, 'height': 960})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page, f'/chat/{META["followup"]}')
    annotation(page)
    page.wait_for_timeout(1500)
    page.get_by_role('textbox', name='Message OpenDuet, or @name').fill(PROMPT)
    page.wait_for_timeout(1800)
    page.get_by_role('textbox', name='Message OpenDuet, or @name').press('Enter')
    review = page.get_by_role('button', name='Review and send', exact=True)
    expect(review).to_be_visible(timeout=20000)
    page.wait_for_timeout(1600)
    page.screenshot(path=str(MEDIA / 'follow-up.png'))
    check(page, 'follow-up draft')
    review.click()
    page.wait_for_timeout(1200)
    page.screenshot(path=str(MEDIA / 'review-draft.png'))
    send = page.get_by_role('button', name='Allow once', exact=False)
    expect(send).to_be_visible()
    page.wait_for_timeout(2200)
    send.click()
    page.wait_for_timeout(2500)
    expect(page.get_by_text('Sent a message to sam@example.com', exact=False)).to_be_visible(timeout=10000)
    check(page, 'sent receipt')
    page.wait_for_timeout(1800)
    video = page.video
    context.close()
    video.save_as(str(RAW / 'follow-up.webm'))

    context = browser.new_context(viewport={'width': 1440, 'height': 960}, color_scheme='light',
                                  record_video_dir=str(RAW), record_video_size={'width': 1440, 'height': 960})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page, '/automations')
    annotation(page)
    page.screenshot(path=str(MEDIA / 'routines.png'))
    check(page, 'routines')
    page.wait_for_timeout(1800)
    page.get_by_role('button', name='Test run', exact=True).first.click()
    page.wait_for_timeout(2200)
    page.screenshot(path=str(MEDIA / 'morning-brief.png'))
    print('ROUTINES', page.locator('body').inner_text()[-5500:])
    check(page, 'routine test run')
    page.wait_for_timeout(2000)
    page.get_by_role('button', name='New routine', exact=True).click()
    page.wait_for_timeout(1500)
    print('FORM', page.locator('body').inner_text()[-3500:])
    page.screenshot(path=str(MEDIA / 'new-routine.png'))
    check(page, 'new routine form')
    page.wait_for_timeout(2500)
    video = page.video
    context.close()
    video.save_as(str(RAW / 'routines.webm'))

    for theme in ['light', 'dark']:
        for width, height in [(1440, 960), (390, 844)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme)
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            for name, route in [('home', '/'), ('memory', '/settings/memory'), ('models', '/settings/models'),
                                ('connections', '/settings/connections'), ('plans', '/plans'),
                                ('routines', '/automations'), ('follow-up', f'/chat/{META["followup"]}')]:
                ready(page, route)
                check(page, f'{name}-{width}-{theme}')
                if width == 1440 or name in ['home', 'routines', 'follow-up']:
                    page.screenshot(path=str(MEDIA / f'{name}-{width}-{theme}.png'))
            # Keyboard reachability of the app's navigation/search controls.
            page.keyboard.press('Control+k')
            expect(page.get_by_role('dialog')).to_be_visible()
            page.keyboard.press('Escape')
            context.close()
    browser.close()
    assert not errors, errors
(ROOT / 'output' / 'docs' / 'capture-report.json').write_text(json.dumps({'checks': checks, 'page_errors': errors}, indent=2))
print(f'Passed {len(checks)} UI checks; no page errors. Assets in {MEDIA}')
