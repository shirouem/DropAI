import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const compositions = await prisma.composition.findMany({
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
                duration: body.duration || 15.0,
                elements: JSON.stringify(body.elements || []),
                collections: JSON.stringify(body.collections || [])
            }
        });
        return NextResponse.json(composition);
    } catch (error) {
        console.error('Error creating composition:', error);
        return NextResponse.json({ error: 'Failed to create composition' }, { status: 500 });
    }
}
