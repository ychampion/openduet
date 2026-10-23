# Sample day media

Captured from the current local OpenDuet source with production React components
and the isolated Sample day API. Every screenshot and video is scripted and
visibly labeled. No real email, account action or paid inference occurred.

Reproduce from the repository root, with Python Playwright and Chromium installed:

```sh
bun install --frozen-lockfile
bun run sample
# In another terminal:
python scripts/docs/capture-product.py
```

The script uses disposable browser contexts: 1440×1000 and 390×844,
both in light and dark appearance. It checks navigation, exact draft review, keyboard search, no horizontal
overflow/broken images, blocked production effect requests, watch pause across
refresh, saved memory controls, blocked browser notification setup and a sample approval/receipt.

PNG output is saved here. The report and original WebM are under
`output/product/` and are not committed. `review.mp4` and `review.gif` are derived
from that recording with FFmpeg; they have no audio. The API is in-memory: run
with a fresh Sample day process before recording the send a second time.

The sample has a prepared result, an explicit saved preference, a deterministic
later task and a confirmed sample watch. It is not a live source/model test.
See [the product verification report](../../PRODUCT_VERIFICATION.md).

The `proactive-*.png` images are captured by
`python scripts/docs/check-assistant.py`. They use actual production components
and the local sample context endpoint. Suggestion and memory-setting persistence
is simulated independently per disposable browser context; database persistence
is covered by server integration tests. No request is submitted by this proof.

`python scripts/docs/record-assistant.py` records the actual sample context
endpoint, editable request and refresh restoration, with zero submissions.
`proactive.mp4` is an H.264 conversion of its WebM output using FFmpeg, with no
audio or fabricated UI. The visible sample label remains throughout.
