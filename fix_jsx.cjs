const fs = require('fs');
let text = fs.readFileSync('src/components/ChatHeader.tsx', 'utf8');
text = text.replace('        </button>\n\n        </div>\n      </div>', '        </button>\n      </div>');
fs.writeFileSync('src/components/ChatHeader.tsx', text);
