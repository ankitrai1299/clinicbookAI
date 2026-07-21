import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Patient } from '../types';
import { Search, UserPlus, X } from 'lucide-react';
import { searchPatients } from '../utils/patientSearch';

interface PatientSelectModalProps {
  patients: Patient[];
  onSelect: (patient: Patient) => void;
  onAdd: (name: string, age: number, gender: string, phone: string) => void;
  onClose: () => void;
}

export default function PatientSelectModal({ patients, onSelect, onAdd, onClose }: PatientSelectModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newGender, setNewGender] = useState('Male');
  const [newPhone, setNewPhone] = useState('');

  const filtered = searchPatients(patients, searchTerm);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName && newAge) {
      onAdd(newName, parseInt(newAge, 10), newGender, newPhone);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{isAdding ? 'Add New Patient' : 'Select Patient'}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{isAdding ? 'Enter patient details' : 'Search existing records'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {!isAdding ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Search by name or phone number..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-0 space-y-2 mt-4 custom-scrollbar">
              {filtered.map((p) => (
                <div 
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="p-4 bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm rounded-xl cursor-pointer transition-all flex justify-between items-center group"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{p.age} yrs • {p.gender}</div>
                  </div>
                  <div className="text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Select
                  </div>
                </div>
              ))}
              
              <div 
                onClick={() => setIsAdding(true)}
                className="p-4 mt-2 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 text-blue-600 font-medium"
              >
                <UserPlus size={18} />
                <span>Add New Patient</span>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAddSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
              <input 
                type="text" required autoFocus
                value={newName} onChange={e => setNewName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Age</label>
                <input 
                  type="number" required min="0" max="150"
                  value={newAge} onChange={e => setNewAge(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender</label>
                <select 
                  value={newGender} onChange={e => setNewGender(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone (Optional)</label>
              <input 
                type="tel"
                value={newPhone} onChange={e => setNewPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="pt-4 flex gap-3">
              <button 
                type="button" onClick={() => setIsAdding(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
              <button 
                type="submit"
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Save & Continue
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
