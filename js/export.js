// export.js
// 把采集记录导出为 CSV 或 Excel（.xlsx）。不依赖 AI，也不依赖第三方库：
// xlsx 本质是一个 zip 包，这里用不压缩（STORE）的方式直接拼出来。

const EXPORT_HEADERS = ['平台', '采集时间', '种子词', '层级', '关键词', '上级关键词'];

/**
 * 把批次展开成表格行；按层级顺序推算每个词的种子词和上级关键词
 */
function batchesToRows(batches, platformName)
{
    const rows = [];
    batches.forEach(function(batch) {
        const time = new Date(batch.time).toLocaleString('zh-CN');
        const parents = [];
        batch.items.forEach(function(item) {
            const level = item[0];
            const keyword = item[1];
            parents[level] = keyword;
            parents.length = level + 1;
            rows.push([platformName(batch.platform), time, parents[1] || keyword, level, keyword, level > 1 ? (parents[level - 1] || '') : '']);
        });
    });
    return rows;
}

function formatCsvCell(value)
{
    let text = String(value);
    // 防止 Excel 把以 = + - @ 开头的关键词当成公式执行
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    if (/[",\n\r\t]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
}

function buildCsv(rows)
{
    return '﻿' + [EXPORT_HEADERS].concat(rows).map(row => row.map(formatCsvCell).join(',')).join('\r\n');
}

function escapeXml(value)
{
    return String(value)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function columnName(index)
{
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        name = String.fromCharCode(65 + (n - 1) % 26) + name;
    }
    return name;
}

function buildSheetXml(rows)
{
    const xmlRows = [EXPORT_HEADERS].concat(rows).map(function(row, r) {
        const cells = row.map(function(value, c) {
            const ref = columnName(c) + (r + 1);
            if (typeof value === 'number') return '<c r="' + ref + '"><v>' + value + '</v></c>';
            return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
        });
        return '<row r="' + (r + 1) + '">' + cells.join('') + '</row>';
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/>'
        + '<col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="6" customWidth="1"/>'
        + '<col min="5" max="6" width="36" customWidth="1"/></cols>'
        + '<sheetData>' + xmlRows.join('') + '</sheetData></worksheet>';
}

function buildXlsx(rows)
{
    const files = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + '<Default Extension="xml" ContentType="application/xml"/>'
            + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            + '</Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            + '</Relationships>',
        'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            + '<sheets><sheet name="关键词" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            + '</Relationships>',
        'xl/worksheets/sheet1.xml': buildSheetXml(rows)
    };
    return buildZip(files);
}

let crcTable = null;
function crc32(bytes)
{
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 生成不压缩的 zip 包
 * @param files {name: 文本内容}
 * @returns {Uint8Array}
 */
function buildZip(files)
{
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    Object.keys(files).forEach(function(name) {
        const nameBytes = encoder.encode(name);
        const data = encoder.encode(files[name]);
        const crc = crc32(data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // 文件名为 UTF-8
        local.setUint16(8, 0, true);      // STORE，不压缩
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, nameBytes.length, true);
        localParts.push(new Uint8Array(local.buffer), nameBytes, data);

        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true);
        central.setUint16(4, 20, true);
        central.setUint16(6, 20, true);
        central.setUint16(8, 0x0800, true);
        central.setUint16(10, 0, true);
        central.setUint32(16, crc, true);
        central.setUint32(20, data.length, true);
        central.setUint32(24, data.length, true);
        central.setUint16(28, nameBytes.length, true);
        central.setUint32(42, offset, true);
        centralParts.push(new Uint8Array(central.buffer), nameBytes);

        offset += 30 + nameBytes.length + data.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, Object.keys(files).length, true);
    end.setUint16(10, Object.keys(files).length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const parts = localParts.concat(centralParts, [new Uint8Array(end.buffer)]);
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let position = 0;
    parts.forEach(function(part) {
        result.set(part, position);
        position += part.length;
    });
    return result;
}

function downloadFile(content, filename, mimeType)
{
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
