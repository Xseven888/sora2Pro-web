/**
 * 作者：沐七
 * 日期：2025/12/11
 */
// 下载工具函数

// 检查浏览器是否支持 File System Access API
const supportsFileSystemAccess = () => {
  return 'showDirectoryPicker' in window;
};

// 注意：File System Access API 的目录句柄无法持久化保存
// 每次页面刷新后需要用户重新选择目录
// 这里只保存目录名称用于显示

// 选择输出目录
export const selectOutputDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
  if (!supportsFileSystemAccess()) {
    alert('您的浏览器不支持文件夹选择功能，将使用浏览器默认下载目录');
    return null;
  }

  try {
    const directoryHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });
    
    // 保存目录名称（不能保存句柄本身）
    localStorage.setItem('outputDirectoryName', directoryHandle.name);
    localStorage.setItem('outputDirectorySelected', 'true');
    
    return directoryHandle;
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error('选择目录失败:', error);
      alert('选择目录失败: ' + error.message);
    }
    return null;
  }
};

// 下载文件到指定目录（使用 File System Access API）
const downloadToDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  url: string,
  filename: string
): Promise<void> => {
  try {
    // 获取文件
    const response = await fetch(url);
    const blob = await response.blob();
    
    // 创建文件句柄
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    
    // 写入文件
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    console.error('保存文件失败:', error);
    throw error;
  }
};

// 传统下载方式（浏览器默认下载目录）
const downloadToDefault = (url: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// 下载单个文件
export const downloadFile = async (
  url: string,
  filename: string,
  directoryHandle: FileSystemDirectoryHandle | null = null
): Promise<void> => {
  if (directoryHandle) {
    try {
      await downloadToDirectory(directoryHandle, url, filename);
    } catch (error) {
      console.error('保存到指定目录失败，使用默认下载:', error);
      downloadToDefault(url, filename);
    }
  } else {
    downloadToDefault(url, filename);
  }
};

// 批量下载文件
export const downloadFiles = async (
  files: Array<{ url: string; filename: string }>,
  directoryHandle: FileSystemDirectoryHandle | null = null,
  onProgress?: (current: number, total: number) => void
): Promise<void> => {
  const total = files.length;
  
  for (let i = 0; i < files.length; i++) {
    const { url, filename } = files[i];
    try {
      await downloadFile(url, filename, directoryHandle);
      if (onProgress) {
        onProgress(i + 1, total);
      }
      // 添加延迟，避免请求过快
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`下载文件 ${filename} 失败:`, error);
    }
  }
};

