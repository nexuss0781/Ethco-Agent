const fs = require('fs');
let content = fs.readFileSync('src/pages/ChatApp.tsx', 'utf8');

// Remove selectedModel state
content = content.replace(
  "const [selectedModel, setSelectedModel] = useState<ModelOption>(AVAILABLE_MODELS[0]);\n",
  ""
);

// Replace selectedModel.id with AVAILABLE_MODELS[0].id
content = content.replace(/selectedModel\.id/g, "AVAILABLE_MODELS[0].id");

// Replace selectedModel.geminiModel with AVAILABLE_MODELS[0].geminiModel
content = content.replace(/selectedModel\.geminiModel/g, "AVAILABLE_MODELS[0].geminiModel");

// Remove selectedModel={selectedModel} and onSelectModel={setSelectedModel} from ChatHeader
content = content.replace(/\s*selectedModel=\{selectedModel\}\s*/g, "\n");
content = content.replace(/\s*onSelectModel=\{setSelectedModel\}\s*/g, "\n");

// Remove selectedModel={selectedModel} and onOpenModelSelector={() => {}} from ChatInput
content = content.replace(/\s*onOpenModelSelector=\{\(\) => \{\}\}\s*/g, "\n");

fs.writeFileSync('src/pages/ChatApp.tsx', content);
console.log("Rewrote ChatApp.tsx");
