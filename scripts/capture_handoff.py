"""Capture handoff screenshots of the main EVYZ screens (read-only; does not save reviews)."""
import asyncio
import subprocess
import sys
import os
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "https://evyz-clinic.preview.emergentagent.com"
OUT = Path(os.environ.get("SHOT_DIR", "/app/docs/screenshots"))
EVENT = "98dc0aeddbad9245"


def ticket():
    code = "import sys; sys.path.insert(0,'tests'); import clerk_helper as c; print(c.sign_in_ticket(c.CLINICIAN_ID))"
    return subprocess.check_output([sys.executable, "-c", code], cwd="/app/backend", text=True).strip()


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/root/bin/chromium", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        await page.goto(f"{BASE}/sign-in?__clerk_ticket={ticket()}")
        await page.wait_for_timeout(7000)
        for name, path, sel in [("01_patient_list", "/", "patients-table"), ("02_patient_timeline", "/patients/001", "glucose-detection-heading"),
                                ("03_event_review", f"/events/{EVENT}", "review-panel"), ("04_lab", "/lab", "live-demo")]:
            await page.goto(BASE + path)
            await page.wait_for_selector(f'[data-testid="{sel}"]', timeout=30000)
            await page.wait_for_timeout(2500)
            await page.screenshot(path=str(OUT / f"{name}_desktop.png"), full_page=True)
        await page.click('[data-testid="demo-calibrate-button"]')
        await page.wait_for_selector('[data-testid="demo-calibration-mode"]', timeout=60000)
        await page.click('[data-testid="demo-compare-button"]')
        await page.wait_for_selector('[data-testid="demo-results"]', timeout=120000)
        await page.locator('[data-testid="demo-results"]').scroll_into_view_if_needed()
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(OUT / "05_lab_comparison_desktop.png"))
        for w in (390, 320):
            await page.set_viewport_size({"width": w, "height": 800})
            await page.goto(BASE + "/")
            await page.wait_for_selector('[data-testid="patient-next-action-mobile-001"]', timeout=30000)
            await page.wait_for_timeout(1500)
            box = await page.locator('[data-testid="patient-next-action-mobile-001"]').bounding_box()
            sw = await page.evaluate("document.documentElement.scrollWidth")
            print(f"{w}px: button x={box['x']:.0f} right={box['x'] + box['width']:.0f} viewport={w} scrollWidth={sw}")
            await page.screenshot(path=str(OUT / f"06_patient_list_{w}px.png"))
            for name, path, sel in [("07_patient_timeline", "/patients/001", "glucose-detection-heading"), ("08_event_review", f"/events/{EVENT}", "review-panel"),
                                    ("09_lab", "/lab", "demo-signal-path"), ("10_lab_delta_strip", "/lab", "lab-delta-strip")]:
                await page.goto(BASE + path)
                await page.wait_for_selector(f'[data-testid="{sel}"]', timeout=30000)
                await page.wait_for_timeout(1500)
                await page.locator(f'[data-testid="{sel}"]').scroll_into_view_if_needed()
                print(w, path, "scrollWidth", await page.evaluate("document.documentElement.scrollWidth"))
                await page.screenshot(path=str(OUT / f"{name}_{w}px.png"))
        await b.close()
    print("saved", sorted(x.name for x in OUT.iterdir()))


asyncio.run(main())
