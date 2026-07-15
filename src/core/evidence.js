import path from 'node:path';
export async function attachScreenshot(params) {
    const filename = `${params.name}.png`;
    const filePath = path.join(params.run.artifacts.runDir, filename);
    await params.page.screenshot({ path: filePath, fullPage: params.fullPage ?? true });
    await params.testInfo.attach(params.name, {
        path: filePath,
        contentType: 'image/png',
    });
    return filePath;
}
export function createPlaywrightFailureEvidence(params) {
    return {
        runDir: params.run.artifacts.runDir,
        playwrightOutputDir: params.testInfo.outputDir,
        screenshot: path.join(params.testInfo.outputDir, 'test-failed-1.png'),
        trace: path.join(params.testInfo.outputDir, 'trace.zip'),
        video: path.join(params.testInfo.outputDir, 'video.webm'),
        url: params.page.url(),
    };
}
