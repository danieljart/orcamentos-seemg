import { Funnel, FunnelChart, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ServicesFunnelChart({ data }: { data: any[] }) {
  // Format the data to match FunnelChart requirements and add colors
  const colors = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0']; // Emerald scale
  const formattedData = data.map((item, index) => ({
    name: item.name,
    value: item.value,
    fill: colors[index % colors.length]
  }));

  return (
    <Card className="w-full">
      <CardHeader className="pt-6 pb-2">
        <CardTitle className="text-base font-semibold">Top 5 Serviços Recorrentes</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px] pb-6 pt-4">
        {formattedData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg">
                        <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">{payload[0].payload.name}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Frequência: <span className="font-bold">{payload[0].value} planilhas</span></p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Funnel
                dataKey="value"
                data={formattedData}
                isAnimationActive
              >
                <LabelList position="right" fill="#64748b" stroke="none" dataKey="name" className="text-xs" />
                <LabelList position="center" fill="#ffffff" stroke="none" dataKey="value" className="text-sm font-bold" />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
            Nenhum dado de serviço disponível.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
