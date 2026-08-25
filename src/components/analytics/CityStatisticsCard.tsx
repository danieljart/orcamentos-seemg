import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CityStatisticsCard({ 
  totalBalance, 
  cities,
  periodFilter,
  setPeriodFilter,
  isLoading
}: { 
  totalBalance: number; 
  cities: { name: string; percentage: number; value: number; color: string }[];
  periodFilter: string;
  setPeriodFilter: (val: string) => void;
  isLoading?: boolean;
}) {
  const colors = ['bg-emerald-600', 'bg-emerald-400', 'bg-teal-500', 'bg-slate-400', 'bg-indigo-400'];

  return (
    <Card className="flex flex-col gap-1 py-1 text-card-foreground w-full rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <CardHeader className="pb-2 pt-4 px-6 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg font-bold text-emerald-900 dark:text-emerald-100 mb-1">Total em Orçamentos</CardTitle>
          {isLoading ? (
            <div className="h-8 w-44 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse my-0.5" />
          ) : (
            <div className="text-2xl font-black text-slate-800 dark:text-slate-200 animate-in fade-in duration-200">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBalance)}
            </div>
          )}
        </div>
        <div className="mt-1">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[180px] bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 focus:ring-emerald-500 font-medium h-9">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <SelectValue placeholder="Selecione o período" />
              </div>
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              <SelectItem value="15d">15 dias</SelectItem>
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
        <div className="border-b border-slate-100 dark:border-slate-700 mb-3 mt-1" />

        {isLoading ? (
          <div className="space-y-2 animate-pulse py-1">
            <div className="flex items-center gap-2 w-full">
              <div className="h-2 bg-emerald-200 dark:bg-emerald-800/40 rounded-sm w-1/2" />
              <div className="h-2 bg-teal-200 dark:bg-teal-800/40 rounded-sm w-1/4" />
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-sm w-1/4" />
            </div>
            <div className="flex gap-4">
              <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full animate-in fade-in duration-300">
            {cities.map((city, idx) => (
              <div
                key={city.name}
                className="space-y-2"
                style={{ width: `${Math.max(city.percentage, 2)}%` }}
                title={`${city.name}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(city.value)}`}
              >
                <div className={cn(colors[idx % colors.length], 'h-2 w-full overflow-hidden rounded-sm transition-all')} />

                <div className="flex flex-col items-start flex-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate w-full" title={city.name}>{city.name}</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-baseline gap-1.5 truncate w-full">
                    {city.percentage.toFixed(1)}%
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 truncate">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(city.value)}
                    </span>
                  </span>
                </div>
              </div>
            ))}
            {cities.length === 0 && (
               <div className="text-sm text-slate-400">Nenhum dado de município.</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
