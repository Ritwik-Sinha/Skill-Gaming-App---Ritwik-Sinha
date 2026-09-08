# Skill Gaming brand assets

These original raster assets were created with the built-in `image_gen` tool on
2026-09-09. The app loads the saved PNGs directly. There is no runtime artwork
generation, SVG drawing, icon font, or external image request.

## Saved assets

- `app-icon.png`: opaque 1024 × 1024 orange controller and gold crown on charcoal.
  Used in the authenticated header and as the source for native launcher icons.
- `money.png`: transparent 384 × 256 emerald cash bundle for the wallet header
  and add-money dialog. The generated alpha channel is preserved.

Android launcher PNGs are exported at 48, 72, 96, 144, and 192 pixels in
`android/app/src/main/res/mipmap-*`. Separate adaptive foreground PNGs use
108, 162, 216, 324, and 432 pixel canvases with an inset to protect the emblem
from launcher masks. The adaptive-icon XML files only configure native masking
and reference these saved raster files; they do not draw the artwork.

The iOS `AppIcon.appiconset` includes opaque PNGs for the iPhone, iPad, and
1024-pixel App Store entries. Native exports use mechanical resizing (and
padding for Android adaptive foregrounds) of the generated source image.

## Final generation prompts

### App icon

```text
Use case: logo-brand. Asset type: final production app launcher icon for an app named Skill Gaming. Create one polished ORIGINAL memorable bold game-controller emblem integrated with a gold three-point crown above it. Orange controller body (#FF5100), gold crown (#F3AF42), charcoal background (#111113). Controller silhouette broad compact with one dark cross control and two simple dark buttons, crown centered just above and visually linked to controller. Subtle dimensional beveled highlights, refined premium mobile gaming finish, strong clean silhouette, readable even at 32 pixels, no tiny details. Composition: square opaque image, full-bleed solid charcoal edge-to-edge background with restrained warm central illumination. Entire logo must fit within central 64 percent width and central 64 percent height for Android adaptive launcher mask safety, centered and balanced. Avoid: any text, letters, wordmark, watermark, perspective tilt, decorative sparks, outer border, pre-rounded outer corners, external drop shadow, transparency, extra objects. Deliver only the square raster icon.
```

### Money

```text
Use case: stylized-concept. Asset type: isolated PNG cash icon for a dark mobile game app's wallet balance header. Primary request: a single compact bundle of emerald green banknotes bound at the center by a clean pale lime paper strap, diagonally oriented lower-left to upper-right and viewed at a simple isometric angle. Charming polished 3D mobile game inventory item, simple bold faceted edges, saturated emerald and mint green surfaces, restrained soft highlights, little detail so readable at 30 pixels tall. Composition: one object alone centered with 8 percent padding, no surrounding objects. Background MUST be truly transparent with alpha, not black, not white and not a checkerboard baked into the image. No cast shadow outside object, no text, no numbers, no currency glyphs, no labels, no watermark, no border. Deliver final production raster artwork only.
```

Original built-in generation IDs: `exec-cca245a7-57bb-43a1-97d5-057cda8feca8`
(app icon) and `exec-94597083-d4ac-4cd8-add0-6914b9b6a5fc` (money). All files
required by the app are saved in the repository; the app has no dependency on
the original generated-images directory.
