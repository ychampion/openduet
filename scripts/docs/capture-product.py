"""Real production components against the isolated, visibly labeled Sample day adapter."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / 'docs/media/sample-day'
OUT = ROOT / 'output/product'
MEDIA.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
WEB = 'http://127.0.0.1:5321'
API = 'http://127.0.0.1:3321'
checks = []
errors = []

def check(page, label):
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), label
    assert page.locator('img').evaluate_all('xs => xs.every(x => x.complete && x.naturalWidth > 0)'), label
    expect(page.get_by_role('region', name='Sample day', exact=True)).to_be_visible()
    checks.append(label)

def ready(page, path='/'):
    page.goto(f'{WEB}/#{path}', wait_until='domcontentloaded')
    expect(page.get_by_role('link', name='Explore', exact=True).first).to_be_visible()
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(350)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, width, height, theme in [('desktop',1440,1000,'light'), ('phone',390,844,'light'), ('dark',1440,1000,'dark'), ('phone-dark',390,844,'dark')]:
        context = browser.new_context(viewport={'width':width,'height':height}, color_scheme=theme)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        ready(page)
        expect(page.get_by_text('Draft prepared', exact=False).first).to_be_visible()
        page.screenshot(path=str(MEDIA / f'chat-{name}.png'))
        check(page, f'{name}: personal Chat and inline draft')
        # The guard must reject a real installation URL before it reaches the network.
        blocked = page.evaluate("""async () => {
          try { await fetch('https://installation.example/api/actions', {method:'POST'}); return false; }
          catch (e) { return String(e).includes('isolated local fixtures'); }
        }""")
        assert blocked
        checks.append(f'{name}: real effect API blocked')
        push = page.evaluate("""async () => {
          let prompts = 0;
          Notification.requestPermission = async () => { prompts++; return 'granted'; };
          const push = await import('/src/experience/push.ts');
          const result = await push.enablePush();
          return {prompts, supported: push.pushSupported(), result};
        }""")
        assert push['prompts'] == 0 and not push['supported'] and not push['result']['ok']
        assert 'Sample day' in push['result']['message']
        checks.append(f'{name}: notification permission and real subscription blocked')
        page.get_by_role('button', name='Review and send', exact=True).first.click()
        inspector = page.locator('.personal-inspector')
        expect(inspector).to_be_visible()
        expect(inspector.get_by_text('To priya@example.com', exact=True).first).to_be_visible()
        assert page.get_by_text('The connection dropped for a moment.', exact=False).count() == 0
        inspector.get_by_role('button', name='Review and send', exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(MEDIA / f'result-{name}.png'))
        check(page, f'{name}: source-bound result inspector')
        page.get_by_role('button', name='Back' if width<700 else 'Close', exact=True).first.click()
        expect(inspector).not_to_be_visible()
        checks.append(f'{name}: result Back/Close restores conversation')
        ready(page, '/work?view=recurring')
        expect(page.get_by_text('Sample day · Northstar pilot', exact=True)).to_be_visible()
        page.screenshot(path=str(MEDIA / f'work-{name}.png'))
        check(page, f'{name}: scoped watch and reachable task controls')
        page.get_by_role('button', name='Pause watch', exact=True).first.click()
        expect(page.get_by_role('button', name='Resume watch', exact=True).first).to_be_visible()
        page.reload(wait_until='domcontentloaded')
        expect(page.get_by_role('button', name='Resume watch', exact=True).first).to_be_visible()
        page.get_by_role('button', name='Resume watch', exact=True).first.click()
        expect(page.get_by_role('button', name='Pause watch', exact=True).first).to_be_visible()
        checks.append(f'{name}: watch pause persists across refresh')
        ready(page, '/explore')
        for title in ['Prepare for a meeting','Research a decision','Follow up on a promise','Prepare my daily brief','Write in my usual style']:
            expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible()
        page.screenshot(path=str(MEDIA / f'explore-{name}.png'))
        check(page, f'{name}: five outcome presets with prerequisites')
        page.keyboard.press('Control+k')
        expect(page.get_by_role('dialog')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).not_to_be_visible()
        checks.append(f'{name}: keyboard search opens and dismisses')
        ready(page, '/settings/notifications')
        expect(page.get_by_text('Browser notifications are unavailable in Sample day.', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Turn on here', exact=True)).to_have_count(0)
        check(page, f'{name}: notification settings explain sample limitation')
        ready(page, '/settings/memory')
        expect(page.get_by_text('For client follow-ups, keep the message under 120 words and make one clear ask.', exact=False).first).to_be_visible()
        page.screenshot(path=str(MEDIA / f'preference-{name}.png'))
        check(page, f'{name}: actual saved preference controls')
        context.close()

    # One recorded, actual UI review of the sample action; nothing contacts a real inbox.
    context = browser.new_context(viewport={'width':1440,'height':1000}, record_video_dir=str(OUT / 'recordings'), record_video_size={'width':1440,'height':1000})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page)
    page.wait_for_timeout(1600)
    page.get_by_role('button', name='Review and send', exact=True).first.click()
    inspector = page.locator('.personal-inspector')
    page.wait_for_timeout(1600)
    inspector.get_by_role('button', name='Review and send', exact=True).click()
    allow = page.get_by_role('button', name='Allow once', exact=False)
    expect(allow).to_be_visible()
    page.screenshot(path=str(MEDIA / 'approval-desktop.png'))
    page.wait_for_timeout(2000)
    allow.click()
    expect(inspector.get_by_text('Sent a message to priya@example.com', exact=False)).to_be_visible()
    page.screenshot(path=str(MEDIA / 'receipt-desktop.png'))
    page.wait_for_timeout(1800)
    checks.append('sample exact-action approval produces sample receipt')
    links = page.evaluate("async () => (await fetch('http://127.0.0.1:3321/sample-day')).json()")
    ready(page, '/chat/' + links['later'])
    expect(page.get_by_text('Applied saved preference:', exact=False).first).to_be_visible()
    page.get_by_text('Applied saved preference:', exact=False).first.scroll_into_view_if_needed()
    page.screenshot(path=str(MEDIA / 'later-preference.png'))
    page.wait_for_timeout(2400)
    ready(page, '/work?view=recurring')
    page.wait_for_timeout(2400)
    ready(page, '/settings/memory')
    page.wait_for_timeout(2400)
    video = page.video
    context.close()
    video.save_as(str(OUT / 'sample-day.webm'))
    browser.close()

assert not errors, errors
report = {'scripted': True, 'live_provider': False, 'checks': checks, 'page_errors': errors}
(OUT / 'browser-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
