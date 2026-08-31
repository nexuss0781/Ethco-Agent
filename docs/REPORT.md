# Tool Capability & System Prompt Gap Analysis Report

This document compares and contrasts the tools currently implemented in the workspace backend (`server_tools.ts`) against the tools declared in the active system prompt (`SYSTEM.md`).

---

## 1. Executive Summary

| Category | Count | Status / Notes |
| :--- | :---: | :--- |
| **System Prompt Declared Tools** | **11** | `bash`, `read`, `write`, `edit`, `glob`, `grep`, `webfetch`, `todowrite`, `task`, `skill`, `question` |
| **Currently Implemented Workspace Tools** | **6** | `run_command`, `view_file`, `create_file`, `edit_file`, `list_directory`, `generate_architecture_plan` |
| **Direct Functional Equivalence (Name / Signature Mismatch)** | **4** | `bash` $\leftrightarrow$ `run_command`, `read` $\leftrightarrow$ `view_file`, `write` $\leftrightarrow$ `create_file`, `edit` $\leftrightarrow$ `edit_file` |
| **Missing Tools in Backend** | **7** | `glob`, `grep`, `webfetch`, `todowrite`, `task`, `skill`, `question` |
| **Extra Tools in Backend** | **2** | `list_directory`, `generate_architecture_plan` |

---

## 2. Detailed Tool-by-Tool Comparison

### A. Core File & Terminal Tools (Implemented with Signature Mismatches)

#### 1. Terminal / Shell Execution
* **System Prompt:** `bash`
  * Parameters: `command` (string, required), `workdir` (string, optional), `timeout` (integer, optional)
* **Current Backend:** `run_command`
  * Parameters: `command` (string, required), `cwd` (string, optional), `timeout` (integer, optional)
* **Gap Analysis:**
  * **Naming Mismatch:** The prompt expects tool name `bash`, whereas backend registers `run_command`.
  * **Argument Key Mismatch:** Working directory parameter is `workdir` in the prompt vs `cwd` in the backend.

---

#### 2. File Reading
* **System Prompt:** `read`
  * Parameters: `filePath` (string, required), `offset` (integer, optional line start, 1-indexed), `limit` (integer, optional line count)
* **Current Backend:** `view_file`
  * Parameters: `path` (string, required), `startLine` (integer, optional), `endLine` (integer, optional)
* **Gap Analysis:**
  * **Naming Mismatch:** `read` vs `view_file`.
  * **Parameter Mismatch:** `filePath` vs `path`.
  * **Range Pagination:** `offset` + `limit` windowing vs `startLine` + `endLine` bounds.

---

#### 3. File Creation / Overwrite
* **System Prompt:** `write`
  * Parameters: `filePath` (string, required), `content` (string, required)
* **Current Backend:** `create_file`
  * Parameters: `path` (string, required), `content` (string, required), `overwrite` (boolean, optional)
* **Gap Analysis:**
  * **Naming Mismatch:** `write` vs `create_file`.
  * **Parameter Mismatch:** `filePath` vs `path`.

---

#### 4. File Editing (Exact Substring Replacement)
* **System Prompt:** `edit`
  * Parameters: `filePath` (string, required), `oldString` (string, required), `newString` (string, required), `replaceAll` (boolean, optional)
* **Current Backend:** `edit_file`
  * Parameters: `path` (string, required), `targetContent` (string, required), `replacementContent` (string, required)
* **Gap Analysis:**
  * **Naming Mismatch:** `edit` vs `edit_file`.
  * **Parameter Mismatches:**
    * `filePath` vs `path`
    * `oldString` vs `targetContent`
    * `newString` vs `replacementContent`
  * **Missing Parameter:** `replaceAll` flag is not currently exposed in `server_tools.ts`.

---

### B. Missing Search & Web Tools in Backend

#### 5. `glob` (File Pattern Matcher)
* **System Prompt Specification:**
  * Parameters: `pattern` (string, required, e.g. `src/**/*.tsx`), `path` (string, optional directory)
* **Current Backend Status:** ❌ Not implemented.
* **Impact:** The LLM cannot perform direct glob searches without falling back to `run_command` (`find` / `ls`).

---

#### 6. `grep` (Regex Content Search)
* **System Prompt Specification:**
  * Parameters: `pattern` (string, required regex), `path` (string, optional directory), `include` (string, optional file pattern)
* **Current Backend Status:** ❌ Not implemented.
* **Impact:** The LLM cannot perform fast in-memory regex searches across files without shelling out to terminal commands.

---

#### 7. `webfetch` (URL Content Scraper)
* **System Prompt Specification:**
  * Parameters: `url` (string, required), `format` (enum: `markdown` | `text` | `html`), `timeout` (number, optional)
* **Current Backend Status:** ❌ Not implemented.
* **Impact:** The LLM cannot fetch external URLs or read documentation pages directly.

---

### C. Missing Coordination & Interactive Tools in Backend

#### 8. `todowrite` (Session Task Tracker)
* **System Prompt Specification:**
  * Parameters: `todos` (array of `{content: string, status: string, priority: string}`)
* **Current Backend Status:** ❌ Not implemented.

#### 9. `task` (Autonomous Subagent Delegator)
* **System Prompt Specification:**
  * Parameters: `description`, `prompt`, `subagent_type` (`explore` | `general`), `task_id`, `command`
* **Current Backend Status:** ❌ Not implemented.

#### 10. `skill` (Specialized Skill Loader)
* **System Prompt Specification:**
  * Parameters: `name` (string)
* **Current Backend Status:** ❌ Not implemented.

#### 11. `question` (Interactive User Prompt)
* **System Prompt Specification:**
  * Parameters: `questions` (array of objects with options)
* **Current Backend Status:** ❌ Not implemented.

---

### D. Extra Tools in Current Backend

1. **`list_directory`**:
   * Inspects folders and subdirectories with optional recursive flag.
   * *Status:* Functional in backend and UI, but not declared in `SYSTEM.md`.
2. **`generate_architecture_plan`**:
   * Formats structured project milestones and roadmap constraints.
   * *Status:* Functional in backend and UI, but not declared in `SYSTEM.md`.

---

## 3. Recommendations & Action Matrix

To achieve 100% fidelity between `SYSTEM.md` and the runtime execution engine:

1. **Implement Aliasing / Dual-Registration:**
   * Support both opencode canonical names (`bash`, `read`, `write`, `edit`) and current names (`run_command`, `view_file`, `create_file`, `edit_file`) in `server_tools.ts`.
   * Accept both parameter conventions (e.g. `workdir` and `cwd`, `filePath` and `path`, `oldString`/`targetContent`, `newString`/`replacementContent`).
2. **Implement Native Search Tools:**
   * Add `glob` (using fast globbing or `picomatch`) and `grep` (fast file regex search) to avoid expensive subshells.
3. **Add `webfetch`:**
   * Provide a server-side fetch endpoint converting web pages to markdown/text.
4. **Add Interactive State Handlers:**
   * Wire `todowrite` to the frontend task state.
