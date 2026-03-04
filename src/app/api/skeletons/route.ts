import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const skeletons = await prisma.skeleton.findMany({
            include: { elements: true },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(skeletons);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch skeletons' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const skeleton = await prisma.skeleton.create({
            data: {
                title: body.title,
                angle: body.angle,
                duration: body.duration || 15.0,
                elements: {
                    create: body.elements?.map((el: any) => ({
                        type: el.type,
                        title: el.title,
                        startTime: el.startTime,
                        duration: el.duration,
                        track: el.track,
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height,
                        zIndex: el.zIndex,
                        properties: el.properties ? JSON.stringify(el.properties) : null
                    })) || []
                }
            },
            include: { elements: true }
        });
        return NextResponse.json(skeleton);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create skeleton' }, { status: 500 });
    }
}
