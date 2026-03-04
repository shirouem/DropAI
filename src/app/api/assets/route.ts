import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const assets = await prisma.asset.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(assets);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const asset = await prisma.asset.create({
            data: {
                type: body.type,
                title: body.title,
                description: body.description,
                thumbnail: body.thumbnail,
                sourceUrl: body.sourceUrl,
                duration: body.duration,
            }
        });
        return NextResponse.json(asset);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
    }
}
