const fs = require('fs');

const routeContent = fs.readFileSync('app/api/career/direction/route.ts', 'utf8');
const schemaMatch = routeContent.match(/export const directionSchema = [\s\S]*?\}\);\n/);
const schemaCode = schemaMatch[0];

const newRoute = routeContent.replace(schemaCode, 'import { directionSchema } from "./schema";\n');
fs.writeFileSync('app/api/career/direction/route.ts', newRoute);

const schemaFile = `import { z } from "zod";\n\n${schemaCode}`;
fs.writeFileSync('app/api/career/direction/schema.ts', schemaFile);

const testContent = fs.readFileSync('app/api/career/direction/route.test.ts', 'utf8');
fs.writeFileSync('app/api/career/direction/route.test.ts', testContent.replace('./route', './schema'));
