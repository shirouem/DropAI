import prisma from './src/lib/prisma'

async function main() {
    try {
        const comp = await prisma.composition.create({
            data: {
                title: 'Test Adapter',
                duration: 120,
                elements: '[]',
                collections: '[]'
            }
        })
        console.log("SUCCESS:", comp.id)
    } catch (e: any) {
        console.error("ERROR_MSG:", e.message)
    }
}

main()
