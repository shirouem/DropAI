import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const skeleton = await prisma.skeleton.findUnique({
            where: { id },
            include: { elements: true }
        });
        if (!skeleton) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(skeleton);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch skeleton' }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();

        // To cleanly update, we delete existing elements and insert the new ones from the UI state
        await prisma.$transaction([
            prisma.skeletonElement.deleteMany({ where: { skeletonId: id } }),
            prisma.skeleton.update({
                where: { id },
                data: {
                    title: body.title,
                    angle: body.angle,
                    duration: body.duration,
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
                }
            })
        ]);

        const updated = await prisma.skeleton.findUnique({
            where: { id },
            include: { elements: true }
        });
        return NextResponse.json(updated);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update skeleton' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.skeleton.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete skeleton' }, { status: 500 });
    }
}
