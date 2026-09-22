const fs = require('fs');

const routeContent = fs.readFileSync('app/api/search-plan/route.ts', 'utf8');
const schemaMatch = routeContent.match(/export const searchPlanSchema = [\s\S]*?\}\);\n/);
const schemaCode = schemaMatch[0];

const newRoute = routeContent.replace(schemaCode, 'import { searchPlanSchema } from "./schema";\n');
fs.writeFileSync('app/api/search-plan/route.ts', newRoute);

const schemaFile = `import { z } from "zod";
import { normaliseCountryCode } from "@/lib/jobs/countries";
import { isEmploymentType } from "@/lib/jobs/employment-types";
import { normaliseExperienceBand } from "@/lib/jobs/experience";

${schemaCode}
`;
fs.writeFileSync('app/api/search-plan/schema.ts', schemaFile);

const testContent = fs.readFileSync('app/api/search-plan/route.test.ts', 'utf8');
fs.writeFileSync('app/api/search-plan/route.test.ts', testContent.replace('./route', './schema'));
