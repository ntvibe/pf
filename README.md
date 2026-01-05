# PF Dashboard

## Google Sheets + Apps Script setup

Follow these steps to connect the app to a Google Sheet:

1. Create a new Google Sheet (e.g. `PF Transactions`).
2. In row 1, add the headers in this exact order:

   ```
   ID, Category, Subcategory, Name, Value, Currency, Date, Notes
   ```

3. Open **Extensions → Apps Script**.
4. Replace the default code with the script below.
5. Click **Deploy → New deployment**.
   - Select **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
6. Click **Deploy**, authorize access, then copy the `/exec` URL.
7. Paste the `/exec` URL into the app’s connection prompt.

### Apps Script code (copy exactly)

```javascript
const SHEET_NAME = "PF Transactions";

function doGet() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return json_({ success: true, data: [] });
  }
  const [header, ...rows] = values;
  const data = rows
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const entry = {};
      header.forEach((key, idx) => {
        entry[key] = row[idx];
      });
      return entry;
    });
  return json_({ success: true, data });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const sheet = getSheet_();
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerIndex = Object.fromEntries(header.map((name, idx) => [name, idx]));
  const idIndex = headerIndex.ID;

  if (payload.action === "addRow") {
    const id = Utilities.getUuid();
    const row = new Array(header.length).fill("");
    header.forEach((name, idx) => {
      if (name === "ID") {
        row[idx] = id;
        return;
      }
      if (payload[name] != null) {
        row[idx] = payload[name];
      }
    });
    sheet.appendRow(row);
    return json_({ success: true, id });
  }

  if (payload.action === "updateCell") {
    const rowIndex = findRowById_(sheet, idIndex, payload.id);
    if (!rowIndex) {
      return json_({ success: false, error: "ID not found." });
    }
    const columnIndex = headerIndex[payload.column];
    if (columnIndex == null) {
      return json_({ success: false, error: "Unknown column." });
    }
    sheet.getRange(rowIndex, columnIndex + 1).setValue(payload.value);
    return json_({ success: true });
  }

  if (payload.action === "deleteRow") {
    const rowIndex = findRowById_(sheet, idIndex, payload.id);
    if (!rowIndex) {
      return json_({ success: false, error: "ID not found." });
    }
    sheet.deleteRow(rowIndex);
    return json_({ success: true });
  }

  return json_({ success: false, error: "Unknown action." });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function findRowById_(sheet, idIndex, id) {
  if (idIndex == null) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0]) === String(id)) {
      return i + 2;
    }
  }
  return null;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```
