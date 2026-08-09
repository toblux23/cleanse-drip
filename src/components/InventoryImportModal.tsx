import { useState, useCallback, useRef } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle, Upload, Download, FileSpreadsheet,
  AlertTriangle, ArrowRight, FileDown, Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  supabase, type Branch, type InventoryProduct, type InventorySupplier,
  INVENTORY_TYPES,
} from '../lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  // Normalized fields
  productName: string;
  productCode: string;
  sku: string;
  inventoryType: string;
  category: string;
  unit: string;
  openingQuantity: number | null;
  unitCost: number | null;
  sellingPrice: number | null;
  minStockLevel: number | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  supplier: string;
  batchNumber: string;
  manufacturingDate: string;
  expirationDate: string;
  branch: string;
  notes: string;
  // Validation result
  valid: boolean;
  errors: string[];
  action: 'create' | 'update' | 'skip';
  matchId?: string;
}

interface ImportModalProps {
  branches: Branch[];
  suppliers: InventorySupplier[];
  products: InventoryProduct[];
  onClose: () => void;
  onImported: () => void;
}

// ─── Template Columns ────────────────────────────────────────────────────────

const TEMPLATE_COLUMNS = [
  'Product Name',
  'Product Code or SKU',
  'Inventory Type',
  'Category',
  'Unit of Measure',
  'Current or Opening Quantity',
  'Unit Cost / Capital Cost',
  'Selling Price',
  'Minimum Stock Level',
  'Reorder Point',
  'Reorder Quantity',
  'Supplier',
  'Batch Number',
  'Manufacturing Date',
  'Expiration Date',
  'Location / Branch',
  'Notes',
];

const COLUMN_ALIASES: Record<string, string> = {
  'product name': 'Product Name',
  'name': 'Product Name',
  'item name': 'Product Name',
  'product code or sku': 'Product Code or SKU',
  'product code': 'Product Code or SKU',
  'sku': 'Product Code or SKU',
  'code': 'Product Code or SKU',
  'inventory type': 'Inventory Type',
  'type': 'Inventory Type',
  'category': 'Category',
  'unit of measure': 'Unit of Measure',
  'unit': 'Unit of Measure',
  'uom': 'Unit of Measure',
  'current or opening quantity': 'Current or Opening Quantity',
  'opening quantity': 'Current or Opening Quantity',
  'current stock': 'Current or Opening Quantity',
  'quantity': 'Current or Opening Quantity',
  'qty': 'Current or Opening Quantity',
  'unit cost / capital cost': 'Unit Cost / Capital Cost',
  'unit cost': 'Unit Cost / Capital Cost',
  'capital cost': 'Unit Cost / Capital Cost',
  'cost': 'Unit Cost / Capital Cost',
  'average cost': 'Unit Cost / Capital Cost',
  'selling price': 'Selling Price',
  'price': 'Selling Price',
  'minimum stock level': 'Minimum Stock Level',
  'min stock': 'Minimum Stock Level',
  'min stock level': 'Minimum Stock Level',
  'reorder point': 'Reorder Point',
  'reorder qty': 'Reorder Quantity',
  'reorder quantity': 'Reorder Quantity',
  'supplier': 'Supplier',
  'batch number': 'Batch Number',
  'batch': 'Batch Number',
  'lot': 'Batch Number',
  'manufacturing date': 'Manufacturing Date',
  'mfg date': 'Manufacturing Date',
  'mfg': 'Manufacturing Date',
  'expiration date': 'Expiration Date',
  'expiry date': 'Expiration Date',
  'expiry': 'Expiration Date',
  'exp date': 'Expiration Date',
  'location / branch': 'Location / Branch',
  'branch': 'Location / Branch',
  'location': 'Location / Branch',
  'notes': 'Notes',
  'remarks': 'Notes',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

function parseDate(val: string): string {
  if (!val) return '';
  // Handle Excel serial date numbers
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 80000) {
    const date = XLSX.SSF.parse_date_code(num);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }
  // Try parsing as date string
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return val;
}

function isValidDate(dateStr: string): boolean {
  if (!dateStr) return true; // empty is valid (optional field)
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function isExpired(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d < new Date();
}

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = String(r[h] ?? '');
      return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function InventoryImportModal({ branches, suppliers, products, onClose, onImported }: ImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'committing' | 'done'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [commitError, setCommitError] = useState('');
  const [commitResult, setCommitResult] = useState<{ created: number; updated: number; transactions: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build lookup maps for duplicate detection
  const productByCode = useCallback(() => {
    const map = new Map<string, InventoryProduct>();
    products.forEach(p => {
      const code = p.product_code || p.sku || '';
      if (code) map.set(normalizeCode(code), p);
    });
    return map;
  }, [products]);

  const productByName = useCallback(() => {
    const map = new Map<string, InventoryProduct>();
    products.forEach(p => {
      if (p.name) map.set(normalizeName(p.name), p);
    });
    return map;
  }, [products]);

  // ─── File Parsing ─────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setParseError('');
    setFileName(file.name);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

      if (jsonRows.length === 0) {
        setParseError('The file is empty or has no data rows.');
        return;
      }

      // Normalize column headers
      const normalized = jsonRows.map((row, idx) => {
        const normalizedRow: Record<string, string> = {};
        Object.entries(row).forEach(([key, val]) => {
          const aliasKey = COLUMN_ALIASES[key.trim().toLowerCase()] ?? key.trim();
          normalizedRow[aliasKey] = String(val ?? '').trim();
        });
        return { rowIndex: idx + 2, raw: normalizedRow }; // +2 for 1-indexed + header row
      });

      // Validate and map each row
      const byCode = productByCode();
      const byName = productByName();
      const seenCodes = new Set<string>();
      const seenNames = new Set<string>();

      const validated: ParsedRow[] = normalized.map(({ rowIndex, raw }) => {
        const productName = raw['Product Name'] ?? '';
        const productCode = raw['Product Code or SKU'] ?? '';
        const inventoryType = raw['Inventory Type'] ?? 'Consumables';
        const unit = raw['Unit of Measure'] ?? 'unit';
        const openingStr = raw['Current or Opening Quantity'] ?? '';
        const costStr = raw['Unit Cost / Capital Cost'] ?? '';
        const priceStr = raw['Selling Price'] ?? '';
        const minStr = raw['Minimum Stock Level'] ?? '';
        const reorderPtStr = raw['Reorder Point'] ?? '';
        const reorderQtyStr = raw['Reorder Quantity'] ?? '';
        const batchNumber = raw['Batch Number'] ?? '';
        const mfgDate = parseDate(raw['Manufacturing Date'] ?? '');
        const expDate = parseDate(raw['Expiration Date'] ?? '');
        const branchName = raw['Location / Branch'] ?? '';

        const errors: string[] = [];

        // Required: Product Name
        if (!productName.trim()) errors.push('Product Name is required');

        // Validate inventory type
        if (inventoryType && !INVENTORY_TYPES.includes(inventoryType as any)) {
          errors.push(`Invalid inventory type "${inventoryType}". Valid: ${INVENTORY_TYPES.join(', ')}`);
        }

        // Validate quantities
        const openingQuantity = openingStr ? Number(openingStr) : null;
        if (openingStr && (isNaN(openingQuantity as number) || (openingQuantity as number) < 0)) {
          errors.push('Opening quantity must be a non-negative number');
        }

        const unitCost = costStr ? Number(costStr) : null;
        if (costStr && (isNaN(unitCost as number) || (unitCost as number) < 0)) {
          errors.push('Unit cost must be a non-negative number');
        }

        const sellingPrice = priceStr ? Number(priceStr) : null;
        if (priceStr && (isNaN(sellingPrice as number) || (sellingPrice as number) < 0)) {
          errors.push('Selling price must be a non-negative number');
        }

        const minStockLevel = minStr ? Number(minStr) : null;
        if (minStr && (isNaN(minStockLevel as number) || (minStockLevel as number) < 0)) {
          errors.push('Min stock level must be non-negative');
        }

        const reorderPoint = reorderPtStr ? Number(reorderPtStr) : null;
        if (reorderPtStr && (isNaN(reorderPoint as number) || (reorderPoint as number) < 0)) {
          errors.push('Reorder point must be non-negative');
        }

        const reorderQuantity = reorderQtyStr ? Number(reorderQtyStr) : null;
        if (reorderQtyStr && (isNaN(reorderQuantity as number) || (reorderQuantity as number) < 0)) {
          errors.push('Reorder quantity must be non-negative');
        }

        // Validate dates
        if (mfgDate && !isValidDate(mfgDate)) errors.push('Invalid manufacturing date');
        if (expDate && !isValidDate(expDate)) errors.push('Invalid expiration date');

        // Check expired
        if (expDate && isExpired(expDate)) {
          errors.push('Product is already expired (will be flagged but can still be imported)');
        }

        // Validate branch
        let branchId = '';
        if (branchName) {
          const match = branches.find(b => b.name.toLowerCase() === branchName.toLowerCase());
          if (!match) {
            errors.push(`Branch "${branchName}" not found. Available: ${branches.map(b => b.name).join(', ')}`);
          } else {
            branchId = match.id;
          }
        }

        // Duplicate detection
        let action: 'create' | 'update' | 'skip' = 'create';
        let matchId: string | undefined;

        const normCode = normalizeCode(productCode);
        const normName = normalizeName(productName);

        if (normCode && byCode.has(normCode)) {
          action = 'update';
          matchId = byCode.get(normCode)!.id;
        } else if (normName && byName.has(normName)) {
          action = 'update';
          matchId = byName.get(normName)!.id;
        }

        // Check duplicates within the file itself
        if (normCode && seenCodes.has(normCode)) {
          errors.push('Duplicate product code within this file');
        } else if (normCode) {
          seenCodes.add(normCode);
        }
        if (normName && seenNames.has(normName)) {
          errors.push('Duplicate product name within this file');
        } else if (normName) {
          seenNames.add(normName);
        }

        return {
          rowIndex,
          raw,
          productName: productName.trim(),
          productCode: productCode.trim(),
          sku: productCode.trim(),
          inventoryType: inventoryType || 'Consumables',
          category: (raw['Category'] ?? '').trim(),
          unit: unit || 'unit',
          openingQuantity,
          unitCost,
          sellingPrice,
          minStockLevel,
          reorderPoint,
          reorderQuantity,
          supplier: (raw['Supplier'] ?? '').trim(),
          batchNumber: batchNumber.trim(),
          manufacturingDate: mfgDate,
          expirationDate: expDate,
          branch: branchId,
          notes: (raw['Notes'] ?? '').trim(),
          valid: errors.length === 0,
          errors,
          action,
          matchId,
        };
      });

      setParsedRows(validated);
      setStep('preview');
    } catch (err) {
      setParseError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // ─── Download Template ────────────────────────────────────────────────────

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Import');
    XLSX.writeFile(wb, 'inventory_import_template.xlsx');
  }

  function downloadRejected() {
    const rejected = parsedRows.filter(r => !r.valid);
    const rows = rejected.map(r => ({
      'Row': r.rowIndex,
      'Product Name': r.productName,
      'Product Code or SKU': r.productCode,
      'Errors': r.errors.join('; '),
      ...Object.fromEntries(Object.entries(r.raw).filter(([k]) => !['Product Name', 'Product Code or SKU'].includes(k))),
    }));
    downloadCsv(`rejected_import_${Date.now()}.csv`, rows);
  }

  // ─── Commit Import ──────────────────────────────────────────────────────────

  async function commitImport() {
    setStep('committing');
    setCommitError('');

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const { data: memberData } = await supabase.from('team_members').select('email').eq('user_id', userId ?? '').maybeSingle();
      const userEmail = memberData?.email ?? null;

      const validRows = parsedRows.filter(r => r.valid);
      const createRows = validRows.filter(r => r.action === 'create');
      const updateRows = validRows.filter(r => r.action === 'update');

      // Create import history record
      const { data: importRecord, error: importErr } = await supabase.from('inventory_imports').insert({
        file_name: fileName,
        imported_by: userId,
        imported_by_email: userEmail,
        total_rows: parsedRows.length,
        successful_rows: validRows.length,
        failed_rows: parsedRows.length - validRows.length,
        products_created: createRows.length,
        products_updated: updateRows.length,
        total_quantity_imported: validRows.reduce((s, r) => s + (r.openingQuantity ?? 0), 0),
        status: 'committed',
      }).select().single();

      if (importErr) throw new Error(`Failed to log import: ${importErr.message}`);

      let created = 0;
      let updated = 0;
      let transactions = 0;
      let failed = 0;

      // Process each valid row
      for (const row of validRows) {
        try {
          let productId = row.matchId;
          const cost = row.unitCost ?? 0;
          const price = row.sellingPrice ?? 0;

          if (row.action === 'create') {
            // Create new product
            const { data: newProduct, error: createErr } = await supabase.from('inventory_products').insert({
              name: row.productName,
              product_code: row.productCode || undefined,
              sku: row.sku || null,
              inventory_type: row.inventoryType,
              category: row.category || null,
              unit: row.unit,
              min_stock_level: row.minStockLevel ?? 0,
              reorder_point: row.reorderPoint ?? 0,
              reorder_quantity: row.reorderQuantity ?? 0,
              average_cost: cost,
              last_purchase_cost: cost,
              standard_cost: cost,
              selling_price: price,
              suggested_selling_price: price,
              branch_id: row.branch || null,
              current_stock: 0,
              beginning_stock: row.openingQuantity ?? 0,
              is_active: true,
            }).select().single();

            if (createErr) throw new Error(`Create product failed: ${createErr.message}`);
            productId = newProduct.id;
            created++;
          } else if (row.action === 'update' && productId) {
            // Update existing product (only stock-relevant fields, not overwriting code/name)
            const { error: updateErr } = await supabase.from('inventory_products').update({
              inventory_type: row.inventoryType,
              category: row.category || null,
              unit: row.unit,
              min_stock_level: row.minStockLevel ?? 0,
              reorder_point: row.reorderPoint ?? 0,
              reorder_quantity: row.reorderQuantity ?? 0,
              average_cost: cost > 0 ? cost : undefined,
              standard_cost: cost > 0 ? cost : undefined,
              selling_price: price > 0 ? price : undefined,
              branch_id: row.branch || null,
            }).eq('id', productId);

            if (updateErr) throw new Error(`Update product failed: ${updateErr.message}`);
            updated++;
          }

          // Record opening balance transaction via adjust_inventory RPC
          if (productId && row.openingQuantity && row.openingQuantity > 0) {
            const { error: adjErr } = await supabase.rpc('adjust_inventory', {
              p_product_id: productId,
              p_quantity: row.openingQuantity,
              p_reason: 'Beginning Balance (Inventory Import)',
              p_notes: `Imported from ${fileName}. Row ${row.rowIndex}. ${row.notes || ''}`.trim(),
              p_user_id: userId,
              p_user_email: userEmail,
            });
            if (adjErr) throw new Error(`Adjustment failed: ${adjErr.message}`);
            transactions++;

            // Create batch if batch number or expiry date exists
            if (productId && (row.batchNumber || row.expirationDate)) {
              let supplierId = null;
              if (row.supplier) {
                const match = suppliers.find(s => s.name.toLowerCase() === row.supplier.toLowerCase());
                if (match) supplierId = match.id;
              }

              const { error: batchErr } = await supabase.from('inventory_batches').insert({
                product_id: productId,
                batch_number: row.batchNumber || `IMPORT-${Date.now()}-${row.rowIndex}`,
                supplier_id: supplierId,
                manufacturing_date: row.manufacturingDate || null,
                expiration_date: row.expirationDate || null,
                quantity: row.openingQuantity,
                remaining_quantity: row.openingQuantity,
                status: 'good',
                branch_id: row.branch || null,
              });
              if (batchErr) throw new Error(`Batch creation failed: ${batchErr.message}`);
            }
          }
        } catch (err) {
          console.error(`Row ${row.rowIndex} failed:`, err);
          failed++;
        }
      }

      setCommitResult({ created, updated, transactions, failed });
      setStep('done');
      onImported();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  }

  // ─── Summary Stats ─────────────────────────────────────────────────────────

  const validRows = parsedRows.filter(r => r.valid);
  const invalidRows = parsedRows.filter(r => !r.valid);
  const createRows = validRows.filter(r => r.action === 'create');
  const updateRows = validRows.filter(r => r.action === 'update');
  const expiredRows = validRows.filter(r => r.expirationDate && isExpired(r.expirationDate));
  const withBatches = validRows.filter(r => r.batchNumber || r.expirationDate);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
              <Upload className="w-4.5 h-4.5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Import Inventory</h3>
              <p className="text-xs text-slate-500">Migrate existing inventory from Excel or CSV files</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-semibold mb-1">How it works</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-xs">
                    <li>Download the template and fill it with your existing inventory data</li>
                    <li>Upload the completed file — we'll parse and validate every row</li>
                    <li>Preview valid rows, invalid rows, duplicates, and errors before committing</li>
                    <li>Confirm to create products, opening balances, and batches with full audit trail</li>
                  </ol>
                </div>
              </div>

              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors"
              >
                <Download className="w-4 h-4" /> Download Import Template (.xlsx)
              </button>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center cursor-pointer hover:border-teal-300 hover:bg-teal-50/30 transition-colors"
              >
                <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600 mb-1">Click to upload your inventory file</p>
                <p className="text-xs text-slate-400">Supports .xlsx, .xls, and .csv files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              {parseError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {parseError}
                </div>
              )}

              {/* Template fields reference */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Template Fields</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {TEMPLATE_COLUMNS.map(col => (
                    <div key={col} className="text-xs text-slate-600 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${col === 'Product Name' ? 'bg-red-400' : 'bg-slate-300'}`} />
                      {col}{col === 'Product Name' && <span className="text-red-400">*</span>}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">* Product Name is required. All other fields are optional.</p>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {commitError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {commitError}
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-emerald-600 uppercase">Valid Rows</p>
                  <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-600 uppercase">Invalid Rows</p>
                  <p className="text-2xl font-bold text-red-700">{invalidRows.length}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-600 uppercase">Will Create</p>
                  <p className="text-2xl font-bold text-blue-700">{createRows.length}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-600 uppercase">Will Update</p>
                  <p className="text-2xl font-bold text-amber-700">{updateRows.length}</p>
                </div>
              </div>

              {/* Additional info */}
              <div className="flex flex-wrap gap-3 text-xs">
                {expiredRows.length > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5" /> {expiredRows.length} expired product(s)
                  </span>
                )}
                {withBatches.length > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> {withBatches.length} row(s) with batch info
                  </span>
                )}
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg">
                  <ArrowRight className="w-3.5 h-3.5" /> {validRows.reduce((s, r) => s + (r.openingQuantity ?? 0), 0)} total units to import
                </span>
              </div>

              {/* Invalid rows */}
              {invalidRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-red-700">Invalid Rows ({invalidRows.length})</p>
                    <button onClick={downloadRejected} className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700">
                      <FileDown className="w-3.5 h-3.5" /> Download Rejected Rows
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-red-50/50 border border-red-100 rounded-xl">
                    {invalidRows.map(r => (
                      <div key={r.rowIndex} className="px-4 py-2 border-b border-red-100/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400">Row {r.rowIndex}</span>
                          <span className="text-sm font-medium text-slate-700">{r.productName || '(no name)'}</span>
                        </div>
                        <p className="text-xs text-red-600 mt-0.5">{r.errors.join('; ')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Valid rows preview */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-700">Valid Rows Preview ({validRows.length})</p>
                <div className="overflow-x-auto bg-white border border-slate-100 rounded-xl">
                  <div className="min-w-[900px]">
                    <div className="grid grid-cols-[60px_1.5fr_100px_80px_80px_80px_80px_80px_80px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                      <span>Row</span>
                      <span>Product Name</span>
                      <span>Action</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Cost</span>
                      <span className="text-right">Price</span>
                      <span>Batch</span>
                      <span>Expiry</span>
                      <span>Branch</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                      {validRows.map(r => (
                        <div key={r.rowIndex} className="grid grid-cols-[60px_1.5fr_100px_80px_80px_80px_80px_80px_80px] items-center px-4 py-2 text-sm">
                          <span className="text-xs font-mono text-slate-400">{r.rowIndex}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700 truncate">{r.productName}</p>
                            {r.productCode && <p className="text-xs text-slate-400">{r.productCode}</p>}
                          </div>
                          <span className={`text-xs font-semibold ${r.action === 'create' ? 'text-blue-600' : 'text-amber-600'}`}>
                            {r.action === 'create' ? 'Create' : 'Update'}
                          </span>
                          <span className="text-right text-slate-700">{r.openingQuantity ?? '—'}</span>
                          <span className="text-right text-slate-600">{r.unitCost != null ? Number(r.unitCost).toFixed(2) : '—'}</span>
                          <span className="text-right text-slate-600">{r.sellingPrice != null ? Number(r.sellingPrice).toFixed(2) : '—'}</span>
                          <span className="text-xs text-slate-500 truncate">{r.batchNumber || '—'}</span>
                          <span className={`text-xs ${r.expirationDate && isExpired(r.expirationDate) ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                            {r.expirationDate || '—'}
                          </span>
                          <span className="text-xs text-slate-500 truncate">{branches.find(b => b.id === r.branch)?.name || 'All'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning for updates */}
              {updateRows.length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">{updateRows.length} existing product(s) will be updated.</span> Existing stock levels will be adjusted via opening balance transactions (not overwritten). Product codes and names will not be changed. Please review before confirming.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Committing */}
          {step === 'committing' && (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="w-10 h-10 animate-spin text-teal-600 mb-4" />
              <p className="text-sm font-semibold text-slate-700">Importing inventory...</p>
              <p className="text-xs text-slate-500 mt-1">Creating products, opening balances, and batches. Please do not close this window.</p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && commitResult && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Import Complete</h3>
              <div className="grid grid-cols-2 gap-4 mt-4 w-full max-w-md">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-blue-600 uppercase">Products Created</p>
                  <p className="text-2xl font-bold text-blue-700">{commitResult.created}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-amber-600 uppercase">Products Updated</p>
                  <p className="text-2xl font-bold text-amber-700">{commitResult.updated}</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-teal-600 uppercase">Opening Transactions</p>
                  <p className="text-2xl font-bold text-teal-700">{commitResult.transactions}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-red-600 uppercase">Failed Rows</p>
                  <p className="text-2xl font-bold text-red-700">{commitResult.failed}</p>
                </div>
              </div>
              {commitResult.failed > 0 && (
                <p className="text-xs text-slate-500 mt-4">Some rows failed during commit. Check the browser console for details.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <div className="text-xs text-slate-400">
            {fileName && step === 'preview' && <span>File: {fileName}</span>}
          </div>
          <div className="flex gap-3">
            {step === 'preview' && (
              <>
                <button onClick={() => { setStep('upload'); setParsedRows([]); setParseError(''); }} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                  Back
                </button>
                <button
                  onClick={commitImport}
                  disabled={validRows.length === 0}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" /> Confirm Import ({validRows.length} rows)
                </button>
              </>
            )}
            {step === 'done' && (
              <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700">
                Close
              </button>
            )}
            {(step === 'upload') && (
              <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
