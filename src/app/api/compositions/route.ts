import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const parentId = searchParams.get('parentId');
        const kind = searchParams.get('kind');
        const compositions = await prisma.composition.findMany({
            where: {
                ...(parentId !== null ? { parentId } : { parentId: null }),
                ...(kind ? { kind } : {}),
            },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(compositions);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch compositions' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const composition = await prisma.composition.create({
            data: {
                title: body.title || 'Untitled Composition',
                angle: body.angle,
                kind: body.kind || 'composition',
                parentId: body.parentId || null,
                duration: body.duration || 15.0,
                elements: JSON.stringify(body.elements || []),
                tracks: JSON.stringify(body.tracks || []),
                collections: JSON.stringify(body.collections || [])
            }
        });
        return NextResponse.json(composition);
    } catch (error) {
        console.error('Error creating composition:', error);
        return NextResponse.json({ error: 'Failed to create composition' }, { status: 500 });
    }
}
