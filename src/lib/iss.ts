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

  return issMap[normalized] || '5';
}
