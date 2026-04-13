import { NextResponse } from 'next/server';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 1. Bundle the Remotion project
        const bundleLocation = await bundle({
            entryPoint: path.join(process.cwd(), 'src/remotion/index.ts'),
            webpackOverride: (config) => config,
        });

        // 2. Select the composition you want to render
        const compositionId = 'MyComp';

        // 3. Extract the composition metadata
        const comps = await getCompositions(bundleLocation, {
            inputProps: body,
        });

        const composition = comps.find((c) => c.id === compositionId);

        if (!composition) {
            throw new Error(`No composition with the ID ${compositionId} found. Check your RemotionRoot.`);
        }

        const outputLocation = path.join(os.tmpdir(), `export-${Date.now()}.mp4`);

        // 4. Render the video
        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: 'h264',
            outputLocation,
            inputProps: body,
        });

        const fileBuffer = fs.readFileSync(outputLocation);
        fs.unlinkSync(outputLocation);

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="export.mp4"`,
            },
        });
    } catch (error: any) {
        console.error('Render failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
