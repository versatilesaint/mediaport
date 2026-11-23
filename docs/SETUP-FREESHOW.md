# FreeShow setup

## Transparency test (Phase 0, brief §9)

Do this on the church's FreeShow computer before any template design, because the answer decides how FreeShow graphics are drawn.

1. In FreeShow, create an **Overlay**.
2. Add a **Website** item and stretch it to fill the whole 1920 × 1080 slide.
3. Set its address to `https://mediaport.koladelawal.org/test/freeshow`.
4. Show a normal slide with the overlay on top.
5. Look at the output:
   - **Pass:** you see a pink box bottom-left, a gold circle top-right, and your slide everywhere else. Use `overlay` mode for FreeShow.
   - **Fail:** the area around the box is white, black or grey and hides your slide. Use `fullframe` mode for FreeShow; OBS stays transparent.

Record the result here:

| Date | FreeShow version | Windows or Mac | Result |
|---|---|---|---|
| | | | |
