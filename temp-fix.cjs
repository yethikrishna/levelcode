const fs = require('fs');
const f = 'c:/Users/kkvin/levelcode-project/levelcode/cli/src/side-chats/side-chat-manager.ts';
let c = fs.readFileSync(f, 'utf8');
c = c.replace("export const SIDE_CHAT_KEYBINDING = 'Ctrl+B'", "export const SIDE_CHAT_KEYBINDING = 'F2'");
c = c.replace("if (key.ctrl && key.name === 'b') {", "if (key.name === 'f2') {");
fs.writeFileSync(f, c, 'utf8');
console.log('Keybinding updated to F2');
