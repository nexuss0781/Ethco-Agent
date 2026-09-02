const fs = require('fs');
const content = fs.readFileSync('src/components/ChatHeader.tsx', 'utf8');

// Find Left section end
const leftStart = content.indexOf('{/* Left: Sidebar Toggle');
const centerStart = content.indexOf('{/* Center: Empty');

// Find Git Repositories Dropdown
const gitRepoStart = content.indexOf('{/* Git Repositories Dropdown */}');
const gitRepoEnd = content.indexOf('</div>\n      </div>\n\n      {/* Center: Empty');

// Find Model Selector Dropdown
const modelStart = content.indexOf('{/* Model Selector Dropdown */}');
const modelEnd = content.indexOf('</div>\n      </div>\n    </header>');

if (gitRepoStart === -1 || modelStart === -1) {
  console.log("Could not find sections");
  process.exit(1);
}

// Extract Git Repo Dropdown
const gitRepoCode = content.slice(gitRepoStart, gitRepoEnd);

// Construct new content
const beforeGitRepo = content.slice(0, gitRepoStart);
const betweenGitRepoAndCenter = content.slice(gitRepoEnd, centerStart);
const beforeModel = content.slice(centerStart, modelStart);
const afterModel = content.slice(modelEnd);

const newContent = beforeGitRepo + betweenGitRepoAndCenter + beforeModel + gitRepoCode + '\n' + afterModel;

fs.writeFileSync('src/components/ChatHeader.tsx', newContent);
console.log("Rewrote ChatHeader.tsx");
