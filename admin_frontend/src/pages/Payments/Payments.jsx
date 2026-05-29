import './Payments.css';

export default function Payments() {
  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="brand-font text-xl font-bold text-[#800020]">Payment Gateway Logs</h2>
        <div className="flex gap-4">
          <span className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-100 flex items-center gap-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> 
            Payment gateway disabled
          </span>
        </div>
      </div>
      
      <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-[#FAF8F6] text-[10px] uppercase font-bold text-gray-400 border-b border-[#D4AF37]/10">
            <tr>
              <th className="px-6 py-4">Transaction ID</th>
              <th className="px-6 py-4">Order Ref</th>
              <th className="px-6 py-4">Method</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-[#D4AF37]/5 bg-white">
            <tr className="hover:bg-[#FAF8F6]/50 transition-colors">
              <td className="px-6 py-4 font-mono font-bold text-[#4A3F35]">pay_L9H3...8xP</td>
              <td className="px-6 py-4 text-gray-500 font-mono">#ORD-2024-001</td>
              <td className="px-6 py-4 font-bold text-[#800020] uppercase tracking-wider">UPI</td>
              <td className="px-6 py-4 font-bold text-[#D4AF37]">₹45,999</td>
              <td className="px-6 py-4">
                <span className="text-green-600 font-bold uppercase text-[9px] tracking-wider bg-green-50 px-2.5 py-1 rounded border border-green-100">Success</span>
              </td>
            </tr>
            <tr className="hover:bg-[#FAF8F6]/50 transition-colors">
              <td className="px-6 py-4 font-mono font-bold text-[#4A3F35]">pay_M2J9...1aQ</td>
              <td className="px-6 py-4 text-gray-500 font-mono">#ORD-2024-004</td>
              <td className="px-6 py-4 font-bold text-[#800020] uppercase tracking-wider">NetBanking</td>
              <td className="px-6 py-4 font-bold text-[#D4AF37]">₹15,000</td>
              <td className="px-6 py-4">
                <span className="text-red-600 font-bold uppercase text-[9px] tracking-wider bg-red-50 px-2.5 py-1 rounded border border-red-100">Failed</span>
              </td>
            </tr>
            <tr className="hover:bg-[#FAF8F6]/50 transition-colors">
              <td className="px-6 py-4 font-mono font-bold text-[#4A3F35]">pay_N4K1...9zR</td>
              <td className="px-6 py-4 text-gray-500 font-mono">#ORD-2024-005</td>
              <td className="px-6 py-4 font-bold text-[#800020] uppercase tracking-wider">Credit Card</td>
              <td className="px-6 py-4 font-bold text-[#D4AF37]">₹32,500</td>
              <td className="px-6 py-4">
                <span className="text-yellow-600 font-bold uppercase text-[9px] tracking-wider bg-yellow-50 px-2.5 py-1 rounded border border-yellow-100">Processing</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
