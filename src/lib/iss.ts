const ISS_MEMORY_KEY = 'seemg_iss_memory';

export function getIssForMunicipio(municipio: string): string {
  const normalized = municipio.trim().toUpperCase();
  
  const issMap: Record<string, string> = {
    'CONTAGEM': '5',
    'BELO HORIZONTE': '5',
    'JUATUBA': '2',
    'ESMERALDAS': '2',
    'IGARAPÉ': '5',
    'MATEUS LEME': '3',
    'BETIM': '3',
    'IBIRITÉ': '4',
    'MÁRIO CAMPOS': '5',
    'SARZEDO': '2',
    'SÃO JOAQUIM DE BICAS': '5'
  };

  // Check local memory first
  try {
    const memory = localStorage.getItem(ISS_MEMORY_KEY);
    if (memory) {
      const memoryMap = JSON.parse(memory);
      if (memoryMap[normalized]) {
        return memoryMap[normalized];
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  return issMap[normalized] || '5';
}

export function saveIssForMunicipio(municipio: string, issValue: string) {
  if (!municipio || !issValue) return;
  const normalized = municipio.trim().toUpperCase();
  
  try {
    let memoryMap: Record<string, string> = {};
    const memory = localStorage.getItem(ISS_MEMORY_KEY);
    if (memory) {
      memoryMap = JSON.parse(memory);
    }
    
    // Only update if it actually changed to avoid unnecessary writes
    if (memoryMap[normalized] !== issValue) {
      memoryMap[normalized] = issValue;
      localStorage.setItem(ISS_MEMORY_KEY, JSON.stringify(memoryMap));
    }
  } catch (e) {
    console.error("Failed to save ISS memory", e);
  }
}
