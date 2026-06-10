"""Fast stitch: detect rows via optical flow, stitch within rows, align via template matching."""
import cv2
import numpy as np
from pathlib import Path

FRAMES_DIR = Path(r"C:\Users\imran\Projects\interactive-maps-abi\public\maps\airport-raw\frames-full")
OUTPUT = Path(r"C:\Users\imran\Projects\interactive-maps-abi\public\maps\airport.png")
BLUR_THRES = 80
MIN_ROW_FRAMES = 8

def dominant_flow(img1, img2):
    gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    corners = cv2.goodFeaturesToTrack(gray1, maxCorners=150, qualityLevel=0.02, minDistance=20)
    if corners is None or len(corners) < 5: return None
    p1 = corners.reshape(-1, 1, 2).astype(np.float32)
    p2, status, _ = cv2.calcOpticalFlowPyrLK(gray1, gray2, p1, None)
    if p2 is None or status is None: return None
    good = status.flatten() == 1
    if good.sum() < 3: return None
    return np.median(p2[good, 0, 0] - p1[good, 0, 0]), np.median(p2[good, 0, 1] - p1[good, 0, 1])

def stitch_row(images):
    if len(images) <= 1: return images[0] if images else None
    stitcher = cv2.Stitcher.create(cv2.Stitcher_SCANS)
    pano = images[0]
    for i in range(1, len(images)):
        try:
            status, result = stitcher.stitch([pano, images[i]])
            if status == cv2.Stitcher_OK:
                pano = result
        except:
            continue
    return pano

def align_rows(top_img, bottom_img, strip_frac=0.2):
    th, tw = top_img.shape[:2]
    bh, bw = bottom_img.shape[:2]
    sh = max(20, int(th * strip_frac))
    top_strip = cv2.cvtColor(top_img[th-sh:th, :], cv2.COLOR_BGR2GRAY)
    bot_strip = cv2.cvtColor(bottom_img[0:min(sh, bh), :], cv2.COLOR_BGR2GRAY)
    if bot_strip.shape[0] < 10: return None
    
    result = cv2.matchTemplate(top_strip, bot_strip, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
    if max_val < 0.25: return None
    
    dx = max_loc[0]
    dy = th - sh + max_loc[1]
    cw, ch = max(tw, dx + bw), dy + bh
    canvas = np.zeros((ch, cw, 3), dtype=np.uint8)
    canvas[0:th, 0:tw] = top_img
    canvas[dy:dy+bh, dx:dx+bw] = bottom_img
    return canvas

def main():
    all_frames = sorted(FRAMES_DIR.glob("frame_*.png"))
    print(f"Frames: {len(all_frames)}")

    loaded = []
    for i, f in enumerate(all_frames):
        img = cv2.imread(str(f))
        if img is None: continue
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.Laplacian(gray, cv2.CV_64F).var()
        loaded.append((i, img, blur))

    # Detect row boundaries
    print("Detecting rows via optical flow...")
    rows = []
    row_start = 0
    current_dir = None
    for idx in range(1, len(loaded)):
        f = dominant_flow(loaded[idx-1][1], loaded[idx][1])
        if f is None: continue
        direction = 1 if f[0] > 3 else (-1 if f[0] < -3 else 0)
        if current_dir is None:
            current_dir = direction
        elif direction != 0 and direction != current_dir:
            if idx - row_start >= MIN_ROW_FRAMES:
                rows.append((row_start, idx))
            row_start = idx
            current_dir = direction
    if len(loaded) - row_start >= MIN_ROW_FRAMES:
        rows.append((row_start, len(loaded)))

    print(f"Found {len(rows)} rows")
    for i, (s, e) in enumerate(rows):
        print(f"  Row {i+1}: frames {loaded[s][0]}-{loaded[e-1][0]} ({e-s} frames)")

    # Stitch each row
    row_panos = []
    for row_idx, (start, end) in enumerate(rows):
        row_imgs = [img for _, img, blur in loaded[start:end] if blur >= BLUR_THRES]
        if len(row_imgs) < 2: continue
        print(f"Stitching row {row_idx+1} ({len(row_imgs)} frames)...")
        pano = stitch_row(row_imgs)
        if pano is not None:
            row_panos.append(pano)
            print(f"  -> {pano.shape[1]}x{pano.shape[0]}")

    if not row_panos:
        print("No rows stitched!")
        return

    # Align and merge rows
    print(f"\nAligning {len(row_panos)} rows...")
    panorama = row_panos[0]
    for i in range(1, len(row_panos)):
        merged = align_rows(panorama, row_panos[i])
        if merged is not None:
            panorama = merged
            print(f"  Aligned row {i+1}: {panorama.shape[1]}x{panorama.shape[0]}")
        else:
            print(f"  Row {i+1} no match, stacking...")
            r = row_panos[i]
            if r.shape[1] != panorama.shape[1]:
                scale = panorama.shape[1] / r.shape[1]
                r = cv2.resize(r, (panorama.shape[1], int(r.shape[0] * scale)))
            panorama = np.vstack([panorama, r])

    # Crop black borders
    gray = cv2.cvtColor(panorama, cv2.COLOR_BGR2GRAY)
    mask = gray > 10
    rows_y = np.any(mask, axis=1)
    cols_x = np.any(mask, axis=0)
    ymin, ymax = np.where(rows_y)[0][[0, -1]]
    xmin, xmax = np.where(cols_x)[0][[0, -1]]
    panorama = panorama[ymin:ymax+1, xmin:xmax+1]

    cv2.imwrite(str(OUTPUT), panorama)
    print(f"\nDONE: {OUTPUT} ({panorama.shape[1]}x{panorama.shape[0]})")

if __name__ == "__main__":
    main()
