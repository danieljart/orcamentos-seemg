interface Props {
  size?: number;
  className?: string;
  /** Raio saindo da cabeça do martelo. */
  bolt?: boolean;
}

/**
 * Mjölnir, o martelo de Thor: ícone do botão "Marretada".
 * Desenhado no mesmo traço dos ícones lucide (stroke 2, cantos arredondados)
 * para não destoar dos outros botões da barra.
 */
export function MjolnirIcon({ size = 20, className = '', bolt = true }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Cabeça, com as faces chanfradas */}
      <path d="M3.5 4.5h13l1.5 1.5v4l-1.5 1.5h-13L2 10V6z" />
      <path d="M6 4.5v7M14 4.5v7" />
      {/* Cabo com as voltas de couro */}
      <path d="M10 11.5v8" />
      <path d="M8.75 14h2.5M8.75 16.5h2.5" />
      {/* Alça */}
      <path d="M10 19.5c-1.6 0-2.6.9-2.6 1.8S8.6 23 10 23s2.6-.8 2.6-1.7" />
      {bolt && <path d="M21 13l-2 3.5h2.5L19 21" className="text-amber-400" stroke="#fbbf24" />}
    </svg>
  );
}
