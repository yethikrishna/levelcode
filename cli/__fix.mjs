const fs = require('fs')
const f = 'src/hooks/__tests__/use-path-tab-completion.test.ts'
let c = fs.readFileSync(f, 'utf8')
c = c.replace("currentPath + path.sep", "currentPath + '/'")
fs.writeFileSync(f, c, 'utf8')
console.log('Fixed:', c.includes("currentPath + '/'"))
