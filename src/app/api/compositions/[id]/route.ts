import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const composition = await prisma.composition.findUnique({
            where: { id: id }
        });

        if (!composition) {
            return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
        }

        return NextResponse.json(composition);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch composition' }, { status: 500 });
    }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        const updateData: any = {};
        if (body.title !== undefined) updateData.title = body.title;
        if (body.angle !== undefined) updateData.angle = body.angle;
        if (body.duration !== undefined) updateData.duration = body.duration;
        if (body.elements !== undefined) updateData.elements = JSON.stringify(body.elements);
        if (body.collections !== undefined) updateData.collections = JSON.stringify(body.collections);

        const composition = await prisma.composition.update({
            where: { id: id },
            data: updateData
        });

        return NextResponse.json(composition);
    } catch (error) {
        console.error('Error updating composition:', error);
        return NextResponse.json({ error: 'Failed to update composition' }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        await prisma.composition.delete({
            where: { id: id }
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete composition' }, { status: 500 });
    }
}
