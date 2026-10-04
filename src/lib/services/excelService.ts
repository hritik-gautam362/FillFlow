import ExcelJS from 'exceljs';
import { ProjectBrief, ProjectFeature, Lead } from '@prisma/client';

export type BriefWithRelations = ProjectBrief & {
  features: ProjectFeature[];
  lead: Lead;
};

interface StructuredData {
  integrations?: string[];
  securityRequirements?: string[];
  constraints?: string[];
  [key: string]: unknown;
}

const SECTION_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' }, // Slate 800
};

const SECTION_HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

const LABEL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' }, // Slate 50
};

const LABEL_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 10,
  bold: true,
  color: { argb: 'FF334155' }, // Slate 700
};

const VALUE_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 10,
  color: { argb: 'FF0F172A' }, // Slate 900
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return 'Not provided';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return 'Not provided';
  return dateObj.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatArrayField(items?: string[] | null, fallback = 'Not provided'): string {
  if (!items || !Array.isArray(items) || items.length === 0) return fallback;
  const filtered = items.filter((i) => typeof i === 'string' && i.trim().length > 0);
  if (filtered.length === 0) return fallback;
  return filtered.join(', ');
}

export async function generateProjectBriefWorkbook(data: BriefWithRelations): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ApexByte AI Client Onboarding System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('Project Brief', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    views: [{ showGridLines: true }],
  });

  // Setup Column Widths
  sheet.columns = [
    { key: 'colA', width: 24 },
    { key: 'colB', width: 34 },
    { key: 'colC', width: 56 },
    { key: 'colD', width: 18 },
  ];

  let currentRow = 1;

  // 1. BANNER HEADER
  const titleRow = sheet.getRow(currentRow);
  titleRow.height = 30;
  sheet.mergeCells(currentRow, 1, currentRow, 4);
  const titleCell = sheet.getCell(currentRow, 1);
  titleCell.value = 'APEXBYTE AI — SOFTWARE PROJECT SPECIFICATION';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  currentRow++;

  const subtitleRow = sheet.getRow(currentRow);
  subtitleRow.height = 20;
  sheet.mergeCells(currentRow, 1, currentRow, 4);
  const subtitleCell = sheet.getCell(currentRow, 1);
  subtitleCell.value = `Client: ${data.lead.companyName || data.lead.clientName} | Project: ${data.title}`;
  subtitleCell.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF94A3B8' } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  currentRow += 2; // Add an empty separator line

  // Helper to add a section header
  const addSectionHeader = (title: string) => {
    const row = sheet.getRow(currentRow);
    row.height = 24;
    sheet.mergeCells(currentRow, 1, currentRow, 4);
    const cell = sheet.getCell(currentRow, 1);
    cell.value = title;
    cell.font = SECTION_HEADER_FONT;
    cell.fill = SECTION_HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    currentRow++;
  };

  // Helper to add a key-value row (Column A: Label, Columns B-D merged: Value)
  const addFieldRow = (label: string, value: string | number | null | undefined, minHeight = 20) => {
    const row = sheet.getRow(currentRow);
    row.height = minHeight;

    const labelCell = sheet.getCell(currentRow, 1);
    labelCell.value = label;
    labelCell.font = LABEL_FONT;
    labelCell.fill = LABEL_FILL;
    labelCell.border = THIN_BORDER;
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    sheet.mergeCells(currentRow, 2, currentRow, 4);
    const valueCell = sheet.getCell(currentRow, 2);
    valueCell.value = value !== undefined && value !== null && String(value).trim().length > 0 ? String(value) : 'Not provided';
    valueCell.font = VALUE_FONT;
    valueCell.border = THIN_BORDER;
    valueCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

    currentRow++;
  };

  const structured = (data.structuredJson as StructuredData) || {};

  // SECTION 1: Project Information
  addSectionHeader('1. PROJECT INFORMATION');
  addFieldRow('Project Title', data.title);
  addFieldRow('Project Type', data.projectType);
  addFieldRow('Executive Summary', data.summary, 32);
  addFieldRow('Target Audience', data.targetAudience, 26);
  currentRow++; // blank line

  // SECTION 2: Technical Requirements
  addSectionHeader('2. TECHNICAL REQUIREMENTS');
  addFieldRow('Recommended Tech Stack', formatArrayField(data.requiredTechStack));
  addFieldRow('Integrations', formatArrayField(structured.integrations));
  addFieldRow('Security Requirements', formatArrayField(structured.securityRequirements));
  addFieldRow('Constraints', formatArrayField(structured.constraints));
  currentRow++; // blank line

  // SECTION 3: Commercial Information
  addSectionHeader('3. COMMERCIAL INFORMATION');
  addFieldRow('Budget Range', data.budgetRange);
  addFieldRow('Estimated Duration', data.estimatedDuration);
  addFieldRow('Qualification Score', `${data.lead.qualificationScore}/100`);
  currentRow++; // blank line

  // SECTION 4: Risks
  addSectionHeader('4. RISKS & CONSTRAINTS');
  const risksText = data.keyRisks && data.keyRisks.length > 0 ? data.keyRisks.map((r) => `• ${r}`).join('\n') : 'None identified';
  addFieldRow('Key Risks', risksText, data.keyRisks && data.keyRisks.length > 1 ? 36 : 22);
  currentRow++; // blank line

  // SECTION 5: Client Information
  addSectionHeader('5. CLIENT INFORMATION');
  addFieldRow('Client Name', data.lead.clientName);
  addFieldRow('Company Name', data.lead.companyName);
  addFieldRow('Email', data.lead.email);
  addFieldRow('Phone', data.lead.phone);
  addFieldRow('Lead Channel', data.lead.channel === 'whatsapp' ? 'WhatsApp Business' : data.lead.channel === 'web_chat' ? 'Web Chat Widget' : 'Contact Form');
  addFieldRow('Lead Status', data.lead.status.toUpperCase());
  currentRow++; // blank line

  // SECTION 6: Features Table
  addSectionHeader('6. FEATURES & REQUIREMENTS BREAKDOWN');

  // Table header row
  const featHeaderRow = sheet.getRow(currentRow);
  featHeaderRow.height = 24;

  const colAHead = sheet.getCell(currentRow, 1);
  colAHead.value = '#';
  colAHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  colAHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  colAHead.alignment = { vertical: 'middle', horizontal: 'center' };
  colAHead.border = THIN_BORDER;

  const colBHead = sheet.getCell(currentRow, 2);
  colBHead.value = 'Feature Name';
  colBHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  colBHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  colBHead.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  colBHead.border = THIN_BORDER;

  const colCHead = sheet.getCell(currentRow, 3);
  colCHead.value = 'Description & Functional Requirements';
  colCHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  colCHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  colCHead.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  colCHead.border = THIN_BORDER;

  const colDHead = sheet.getCell(currentRow, 4);
  colDHead.value = 'Complexity';
  colDHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  colDHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  colDHead.alignment = { vertical: 'middle', horizontal: 'center' };
  colDHead.border = THIN_BORDER;

  currentRow++;

  // Feature rows
  if (data.features && data.features.length > 0) {
    data.features.forEach((feat, idx) => {
      const row = sheet.getRow(currentRow);
      row.height = 24;

      const isEven = idx % 2 === 1;
      const rowFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' },
      };

      // Col A: #
      const c1 = sheet.getCell(currentRow, 1);
      c1.value = idx + 1;
      c1.font = VALUE_FONT;
      c1.fill = rowFill;
      c1.border = THIN_BORDER;
      c1.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col B: Name
      const c2 = sheet.getCell(currentRow, 2);
      c2.value = feat.name;
      c2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      c2.fill = rowFill;
      c2.border = THIN_BORDER;
      c2.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

      // Col C: Description
      const c3 = sheet.getCell(currentRow, 3);
      c3.value = feat.description;
      c3.font = VALUE_FONT;
      c3.fill = rowFill;
      c3.border = THIN_BORDER;
      c3.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

      // Col D: Complexity
      const c4 = sheet.getCell(currentRow, 4);
      c4.value = feat.complexity;
      const complexityColor =
        feat.complexity === 'High'
          ? 'FFDC2626' // Red
          : feat.complexity === 'Medium'
          ? 'FFD97706' // Amber
          : 'FF16A34A'; // Green
      c4.font = { name: 'Calibri', size: 10, bold: true, color: { argb: complexityColor } };
      c4.fill = rowFill;
      c4.border = THIN_BORDER;
      c4.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow++;
    });
  } else {
    // Empty features row
    const row = sheet.getRow(currentRow);
    row.height = 24;
    sheet.mergeCells(currentRow, 1, currentRow, 4);
    const c = sheet.getCell(currentRow, 1);
    c.value = 'No specific feature rows attached to this brief.';
    c.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    c.border = THIN_BORDER;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    currentRow++;
  }

  currentRow++; // blank line

  // SECTION 7: Metadata
  addSectionHeader('7. SPECIFICATION METADATA');
  addFieldRow('Brief Created At', formatDate(data.createdAt));
  addFieldRow('Lead Created At', formatDate(data.lead.createdAt));
  addFieldRow('Last Active', formatDate(data.lead.lastActive));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generateSanitizedFilename(companyName?: string, projectTitle?: string): string {
  const sanitize = (s?: string) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const companySlug = sanitize(companyName) || 'client';
  const projectSlug = sanitize(projectTitle) || 'project-specification';

  return `project-brief-${companySlug}-${projectSlug}.xlsx`;
}
