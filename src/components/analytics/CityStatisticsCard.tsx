import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CityStatisticsCard({ 
  totalBalance, 
  cities,
  periodFilter,
  setPeriodFilter
}: { 
  totalBalance: number; 
  cities: { name: string; percentage: number; value: number; color: string }[];
  periodFilter: string;
  setPeriodFilter: (val: string) => void;
}) {
  const colors = ['bg-emerald-600', 'bg-emerald-400', 'bg-teal-500', 'bg-slate-400', 'bg-indigo-400'];

  return (
    <Card className="flex flex-col gap-1 py-1 text-card-foreground w-full rounded-xl shadow-sm border border-slate-200 bg-white">
      <CardHeader className="pb-2 pt-4 px-6 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg font-bold text-emerald-900 mb-1">Total em Orçamentos</CardTitle>
          <div className="text-2xl font-black text-slate-800">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBalance)}
          </div>
        </div>
        <div className="mt-1">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[180px] bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-emerald-500 font-medium h-9">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <SelectValue placeholder="Selecione o período" />
              </div>
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="3m">3 meses</SelectItem>
              <SelectItem value="6m">6 meses</SelectItem>
              <SelectItem value="1y">1 ano</SelectItem>
              <SelectItem value="all">Todo o período cadastrado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-4 pt-0">
        <div className="border-b border-slate-100 mb-3 mt-1" />

        {/* Segmented Progress Bar */}
        <div className="flex items-center gap-2 w-full">
          {cities.map((city, idx) => (
            <div
              key={city.name}
              className="space-y-2"
              style={{ width: `${Math.max(city.percentage, 2)}%` }}
              title={`${city.name}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(city.value)}`}
            >
              <div className={cn(colors[idx % colors.length], 'h-2 w-full overflow-hidden rounded-sm transition-all')} />

              <div className="flex flex-col items-start flex-1">
                <span className="text-xs text-slate-500 font-medium truncate w-full" title={city.name}>{city.name}</span>
                <span className="text-sm font-bold text-slate-700">{city.percentage.toFixed(1)}%</span>
              </div>
            </div>
          ))}
          {cities.length === 0 && (
             <div className="text-sm text-slate-400">Nenhum dado de município.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
