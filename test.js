const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const comp = await prisma.composition.create({
            data: {
                title: 'Test',
                duration: 120,
                elements: '[]',
                collections: '[]'
            }
        });
        console.log("SUCCESS:", comp.id);
    } catch (e) {
        console.error("ERROR_MSG:", e.message);
    }
}

main().finally(() => window.process.exit(0)); // using process.exit just in case
