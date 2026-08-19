const fs = require('fs')
const f = 'src/utils/__tests__/fingerprint.test.ts'
let c = fs.readFileSync(f, 'utf8')
c = c.replace("// Format: levelcode-cli- (13 chars) + 8 random chars = 21 chars", "// Format: levelcode-cli- (14 chars) + 8 random chars = 22 chars")
c = c.replace("expect(fingerprint.length).toBe(21)", "expect(fingerprint.length).toBe(22)")
fs.writeFileSync(f, c, 'utf8')
console.log('Fixed:', c.includes('toBe(22)'))
