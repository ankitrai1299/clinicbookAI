import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';

export default function GenericListView({ title, description, items, emptyMessage, renderItem, searchable, searchPlaceholder = "Search...", transformItems }: any) {
  const [searchQuery, setSearchQuery] = useState('');

  // `transformItems(items, query)` lets a caller fully control filtering/sorting
  // (e.g. the Sessions page's date-priority order). When not provided, fall back
  // to the default substring filter so other lists behave exactly as before.
  const filteredItems = searchable
    ? (transformItems
        ? transformItems(items, searchQuery)
        : (searchQuery
            ? items.filter((item: any) => JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase()))
            : items))
    : items;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500">{description}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {searchable && (
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>
          </div>
        )}
      
        <div className="divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500">{emptyMessage}</div>
          ) : (
            filteredItems.map(renderItem)
          )}
        </div>
      </div>
    </motion.div>
  );
}
