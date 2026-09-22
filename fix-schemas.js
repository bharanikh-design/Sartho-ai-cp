const fs = require('fs');
const path = require('path');

function fix(routePath, schemaName) {
  const dir = path.dirname(routePath);
  const routeContent = fs.readFileSync(routePath, 'utf8');
  const testPath = path.join(dir, 'route.test.ts');
  const testContent = fs.readFileSync(testPath, 'utf8');
  
  // Find the schema definition using regex
  const schemaRegex = new RegExp(`export const ${schemaName} = z\\.object\\(\\{[\\s\\S]*?\\}\\);\\n`);
  const match = routeContent.match(schemaRegex);
  
  if (match) {
    const schemaDef = `import { z } from "zod";\n\n` + match[0];
    fs.writeFileSync(path.join(dir, 'schema.ts'), schemaDef);
    
    const newRouteContent = routeContent.replace(match[0], '').replace(`import { z } from "zod";`, `import { z } from "zod";\nimport { ${schemaName} } from "./schema";`);
    fs.writeFileSync(routePath, newRouteContent);
    
    const newTestContent = testContent.replace(`import { ${schemaName} } from "./route";`, `import { ${schemaName} } from "./schema";`);
    fs.writeFileSync(testPath, newTestContent);
    console.log(`Fixed ${schemaName}`);
  } else {
    console.log(`Could not find ${schemaName} in ${routePath}`);
  }
}

fix('app/api/career/direction/route.ts', 'directionSchema');
fix('app/api/jobs/route.ts', 'jobInputSchema');
fix('app/api/search-plan/route.ts', 'searchPlanSchema');
