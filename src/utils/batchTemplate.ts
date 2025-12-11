/**
 * 作者：沐七
 * 日期：2025/12/11
 */

import * as XLSX from 'xlsx';

// 批量生成模版数据类型
export interface BatchTemplateRow {
  图片地址: string;
  模型: string; // 1=Sora-2, 2=Sora-2-Pro
  时长: string; // 10, 15, 25
  比例: string; // 1=竖屏, 2=横屏
  尺寸: string; // 1=720p, 2=1080p
  提示词: string;
}

// 解析后的视频生成参数
export interface ParsedVideoParams {
  imageUrl: string;
  model: 'sora-2' | 'sora-2-pro';
  duration: number;
  orientation: 'portrait' | 'landscape';
  size: 'small' | 'large';
  prompt: string;
}

// 下载模版Excel文件
export const downloadTemplate = () => {
  // Excel表头（包含说明）
  const headers = [
    '图片地址',
    '模型（1=Sora-2， 2=Sora-2-Pro）',
    '时长（10，15，25）',
    '比例（1=竖屏，2=横屏）',
    '尺寸（1=720p，2=1080p）',
    '提示词'
  ];
  
  // 示例数据行
  const exampleRow = [
    'https://example.com/image.jpg',
    '1',
    '10',
    '1',
    '1',
    '示例提示词：描述视频内容'
  ];
  
  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // 创建工作表数据
  const wsData = [
    headers,
    exampleRow
  ];
  
  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // 设置列宽
  ws['!cols'] = [
    { wch: 30 }, // 图片地址
    { wch: 25 }, // 模型
    { wch: 10 }, // 时长
    { wch: 15 }, // 比例
    { wch: 15 }, // 尺寸
    { wch: 40 }  // 提示词
  ];
  
  // 将工作表添加到工作簿
  XLSX.utils.book_append_sheet(wb, ws, '批量生成模版');
  
  // 生成Excel文件并下载
  XLSX.writeFile(wb, `视频批量生成模版_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// 智能CSV解析函数（处理引号、逗号和括号）
const parseCSVLine = (line: string, delimiter: string = ','): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let parenDepth = 0; // 括号深度，用于处理括号内的分隔符
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 转义的双引号
        current += '"';
        i++;
      } else {
        // 切换引号状态
        inQuotes = !inQuotes;
        current += char;
      }
    } else if (char === '(' || char === '（') {
      // 开始括号
      parenDepth++;
      current += char;
    } else if (char === ')' || char === '）') {
      // 结束括号
      parenDepth--;
      current += char;
    } else if (char === delimiter && !inQuotes && parenDepth === 0) {
      // 不在引号内且不在括号内的分隔符，作为字段分隔符
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // 添加最后一个字段
  result.push(current.trim());
  
  return result;
};

// 检测CSV分隔符
const detectDelimiter = (line: string): string => {
  // 统计各种分隔符的出现次数
  const commaCount = (line.match(/,/g) || []).length;
  const semicolonCount = (line.match(/;/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;
  
  // 选择出现次数最多的分隔符
  if (tabCount > commaCount && tabCount > semicolonCount) {
    return '\t';
  } else if (semicolonCount > commaCount) {
    return ';';
  } else {
    return ',';
  }
};

// 解析CSV文件
export const parseCSV = (csvText: string): BatchTemplateRow[] => {
  // 移除BOM标记（如果存在）
  const cleanText = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allLines = cleanText.split('\n');
  const lines = allLines.filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV文件格式不正确，至少需要表头和数据行');
  }
  
  // 检测分隔符
  const delimiter = detectDelimiter(lines[0]);
  console.log('检测到的分隔符:', delimiter === '\t' ? 'TAB' : delimiter === ';' ? '分号' : '逗号');
  
  // 解析表头（可能包含说明，需要提取基础列名）
  const rawHeaders = parseCSVLine(lines[0], delimiter);
  
  console.log('CSV第一行原始内容:', lines[0]);
  console.log('解析到的表头:', rawHeaders);
  console.log('表头数量:', rawHeaders.length);
  
  // 将表头映射到基础列名（去除说明部分）
  const headerMap: Record<string, string> = {};
  const baseHeaders = ['图片地址', '模型', '时长', '比例', '尺寸', '提示词'];
  
  rawHeaders.forEach((rawHeader) => {
    // 清理表头：去除所有空白字符和不可见字符
    let baseHeader = rawHeader.trim().replace(/\s+/g, ''); // 移除所有空白字符
    
    // 尝试匹配基础列名（支持多种格式）
    for (const base of baseHeaders) {
      const baseClean = base.replace(/\s+/g, ''); // 也清理基础列名
      
      // 完全匹配（忽略空白字符）
      if (baseHeader === baseClean) {
        headerMap[rawHeader] = base;
        return;
      }
      
      // 匹配带中文括号的：模型（...）
      if (baseHeader.startsWith(baseClean + '（')) {
        headerMap[rawHeader] = base;
        return;
      }
      
      // 匹配带英文括号的：模型(...)
      if (baseHeader.startsWith(baseClean + '(')) {
        headerMap[rawHeader] = base;
        return;
      }
      
      // 匹配包含基础列名的（更宽松的匹配）
      if (baseHeader.includes(baseClean)) {
        headerMap[rawHeader] = base;
        return;
      }
    }
  });
  
  console.log('表头映射:', headerMap);
  
  // 验证必要的列是否存在
  const foundHeaders = Object.values(headerMap);
  const missingHeaders = baseHeaders.filter(h => !foundHeaders.includes(h));
  if (missingHeaders.length > 0) {
    console.error('缺少的列:', missingHeaders);
    console.error('解析到的原始表头:', rawHeaders);
    console.error('表头映射结果:', headerMap);
    console.error('CSV第一行原始内容:', lines[0]);
    
    // 提供更详细的错误信息
    const errorMsg = `缺少必要的列：${missingHeaders.join(', ')}。\n\n` +
      `解析到的表头：${rawHeaders.join(', ')}\n\n` +
      `请确保表头包含以下列：图片地址、模型、时长、比例、尺寸、提示词\n` +
      `（表头可以包含说明，如：模型（1=Sora-2，2=Sora-2-Pro））`;
    throw new Error(errorMsg);
  }
  
  // 解析数据行
  const rows: BatchTemplateRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // 跳过空行
    
    const values = parseCSVLine(line, delimiter);
    if (values.length < rawHeaders.length) {
      console.warn(`第 ${i + 1} 行数据不完整，期望 ${rawHeaders.length} 列，实际 ${values.length} 列，跳过`);
      continue; // 跳过不完整的行
    }
    
    const row: any = {};
    rawHeaders.forEach((rawHeader, index) => {
      const baseHeader = headerMap[rawHeader];
      if (baseHeader) {
        row[baseHeader] = values[index] || '';
      }
    });
    
    // 验证必要字段
    if (row['提示词'] && row['提示词'].trim()) {
      rows.push(row as BatchTemplateRow);
    }
  }
  
  return rows;
};

// 将模版行转换为视频生成参数
export const parseTemplateRow = (row: BatchTemplateRow): ParsedVideoParams | null => {
  try {
    // 解析模型
    let model: 'sora-2' | 'sora-2-pro' = 'sora-2';
    if (row.模型 === '2') {
      model = 'sora-2-pro';
    } else if (row.模型 !== '1') {
      throw new Error(`无效的模型值：${row.模型}，应为1或2`);
    }
    
    // 解析时长
    const duration = parseInt(row.时长, 10);
    if (isNaN(duration) || ![10, 15, 25].includes(duration)) {
      throw new Error(`无效的时长值：${row.时长}，应为10、15或25`);
    }
    
    // 解析比例
    let orientation: 'portrait' | 'landscape' = 'portrait';
    if (row.比例 === '2') {
      orientation = 'landscape';
    } else if (row.比例 !== '1') {
      throw new Error(`无效的比例值：${row.比例}，应为1或2`);
    }
    
    // 解析尺寸
    let size: 'small' | 'large' = 'small';
    if (row.尺寸 === '2') {
      size = 'large';
    } else if (row.尺寸 !== '1') {
      throw new Error(`无效的尺寸值：${row.尺寸}，应为1或2`);
    }
    
    // 验证提示词
    if (!row.提示词 || !row.提示词.trim()) {
      throw new Error('提示词不能为空');
    }
    
    return {
      imageUrl: row.图片地址 || '',
      model,
      duration,
      orientation,
      size,
      prompt: row.提示词.trim()
    };
  } catch (error: any) {
    console.error('解析模版行失败:', error);
    return null;
  }
};

// 读取Excel文件
export const readExcelFile = (file: File): Promise<BatchTemplateRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('读取文件失败'));
          return;
        }
        
        // 解析Excel文件
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 获取第一个工作表
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 将工作表转换为JSON数组
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
        
        if (jsonData.length < 2) {
          reject(new Error('Excel文件格式不正确，至少需要表头和数据行'));
          return;
        }
        
        // 解析表头
        const rawHeaders = (jsonData[0] as string[]).map(h => String(h || '').trim());
        console.log('Excel解析到的表头:', rawHeaders);
        
        // 将表头映射到基础列名
        const headerMap: Record<string, string> = {};
        const baseHeaders = ['图片地址', '模型', '时长', '比例', '尺寸', '提示词'];
        
        rawHeaders.forEach((rawHeader) => {
          let baseHeader = rawHeader.replace(/\s+/g, '');
          
          for (const base of baseHeaders) {
            const baseClean = base.replace(/\s+/g, '');
            
            if (baseHeader === baseClean) {
              headerMap[rawHeader] = base;
              return;
            }
            
            if (baseHeader.startsWith(baseClean + '（') || baseHeader.startsWith(baseClean + '(')) {
              headerMap[rawHeader] = base;
              return;
            }
            
            if (baseHeader.includes(baseClean)) {
              headerMap[rawHeader] = base;
              return;
            }
          }
        });
        
        console.log('Excel表头映射:', headerMap);
        
        // 验证必要的列是否存在
        const foundHeaders = Object.values(headerMap);
        const missingHeaders = baseHeaders.filter(h => !foundHeaders.includes(h));
        if (missingHeaders.length > 0) {
          console.error('缺少的列:', missingHeaders);
          console.error('解析到的表头:', rawHeaders);
          reject(new Error(`缺少必要的列：${missingHeaders.join(', ')}。请检查表头格式是否正确。`));
          return;
        }
        
        // 解析数据行
        const rows: BatchTemplateRow[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const rowData = jsonData[i] as any[];
          if (!rowData || rowData.length === 0) continue;
          
          const row: any = {};
          rawHeaders.forEach((rawHeader, index) => {
            const baseHeader = headerMap[rawHeader];
            if (baseHeader) {
              row[baseHeader] = String(rowData[index] || '').trim();
            }
          });
          
          // 验证必要字段
          if (row['提示词'] && row['提示词'].trim()) {
            rows.push(row as BatchTemplateRow);
          }
        }
        
        resolve(rows);
      } catch (error: any) {
        console.error('解析Excel文件失败:', error);
        reject(new Error(`解析Excel文件失败: ${error.message}`));
      }
    };
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    reader.readAsArrayBuffer(file);
  });
};

