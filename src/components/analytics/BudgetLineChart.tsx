import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, MoreHorizontal } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

const chartConfig = {
  goals: {
    label: 'Quantidade',
    color: 'var(--color-pink-500, #ec4899)',
  },
  sales: {
    label: 'Total R$',
    color: 'var(--color-teal-500, #14b8a6)',
  },
} satisfies ChartConfig;

const ChartLabel = ({ label, color = chartConfig.sales.color }: { label: string; color: string }) => {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-3.5 h-3.5 border-4 rounded-full bg-background" style={{ borderColor: color }}></div>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const filteredPayload = payload.filter((entry: any) => entry.dataKey !== 'salesArea');

    return (
      <div className="rounded-lg border bg-popover p-3 shadow-sm shadow-black/5 min-w-[180px] bg-white dark:bg-slate-800">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide mb-2.5">{label}</div>
        <div className="space-y-2">
          {filteredPayload.map((entry: any, index: number) => {
            const config = (chartConfig as any)[entry.dataKey];
            return (
              <div key={index} className="flex items-center gap-2 text-xs">
                <ChartLabel label={config?.label + ':'} color={entry.color} />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {entry.dataKey === 'sales' ? 
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entry.value) :
                    entry.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export function BudgetLineChart({ data }: { data: any[] }) {
  // Map our generic data to the format expected by the chart
  const formattedData = data.map(d => ({
    month: d.month,
    goals: d.count,
    sales: d.totalValue,
    salesArea: d.totalValue,
  }));

  return (
    <Card className="w-full">
      <CardHeader className="border-0 min-h-auto pt-6 pb-6 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Evolução de Orçamentos</CardTitle>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <ChartLabel label="Total R$" color={chartConfig.sales.color} />
            <ChartLabel label="Quantidade" color={chartConfig.goals.color} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="-me-1.5 h-8 w-8 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Download className="w-4 h-4 mr-2" />
                Exportar Dados
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="px-2.5 flex flex-col items-end">
        <ChartContainer
          config={chartConfig}
          className="h-[300px] w-full"
        >
          <ComposedChart
            data={formattedData}
            margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartConfig.sales.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={chartConfig.sales.color} stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" strokeOpacity={1} horizontal={true} vertical={false} />

            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={5} tickMargin={12} />
            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`} tickMargin={12} />
            <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickMargin={12} />

            <ChartTooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: 'none' }} />

            <Area yAxisId="left" type="linear" dataKey="salesArea" stroke="transparent" fill="url(#salesGradient)" strokeWidth={0} dot={false} />
            <Line yAxisId="left" type="linear" dataKey="sales" stroke={chartConfig.sales.color} strokeWidth={2} dot={{ fill: '#fff', strokeWidth: 2, r: 6, stroke: chartConfig.sales.color }} />
            <Line yAxisId="right" type="linear" dataKey="goals" stroke={chartConfig.goals.color} strokeWidth={2} strokeDasharray="4 4" dot={{ fill: '#fff', strokeWidth: 2, r: 6, stroke: chartConfig.goals.color, strokeDasharray: '0' }} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
