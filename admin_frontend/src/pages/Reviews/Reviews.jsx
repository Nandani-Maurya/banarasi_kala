import { useState, useEffect } from 'react';
import { Trash2, CheckCircle, Star, MessageSquare } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import './Reviews.css';

export default function Reviews() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'approved'

  useEffect(() => {
    fetchFeedbacks();
  }, [activeTab]);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const endpoint = activeTab === 'pending' 
        ? `${API_ENDPOINTS.feedback}/pending` 
        : `${API_ENDPOINTS.feedback}/approved`;
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || localStorage.getItem('accessToken') || localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setFeedbacks(data.data);
      }
    } catch (error) {
      console.error('Error fetching feedbacks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.feedback}/approve/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || localStorage.getItem('accessToken') || localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        fetchFeedbacks();
      }
    } catch (error) {
      console.error('Error approving feedback:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this feedback?')) return;
    try {
      const response = await fetch(`${API_ENDPOINTS.feedback}/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token') || localStorage.getItem('accessToken') || localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        fetchFeedbacks();
      }
    } catch (error) {
      console.error('Error deleting feedback:', error);
    }
  };

  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="brand-font text-2xl font-bold text-[#800020]">Feedback Moderation</h2>
          <p className="text-gray-500 text-sm mt-1">Manage customer reviews and storefront testimonials</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-[#800020] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Pending
          </button>
          <button 
            onClick={() => setActiveTab('approved')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'approved' ? 'bg-white text-[#800020] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Approved
          </button>
        </div>
      </div>
      
      <div className="glass-card rounded-2xl overflow-hidden shadow-sm border border-[#D4AF37]/10">
        {loading ? (
          <div className="p-20 text-center">
            <div className="w-10 h-10 border-4 border-[#D4AF37]/20 border-t-[#800020] rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400 text-sm font-medium">Loading feedbacks...</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-[#FAF8F6] text-[10px] uppercase font-bold text-gray-400 border-b border-[#D4AF37]/10">
              <tr>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Rating</th>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Review</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-[#D4AF37]/5 bg-white">
              {feedbacks.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <MessageSquare className="w-12 h-12 text-gray-200" />
                      <p className="text-gray-400 font-medium">No {activeTab} feedback found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                feedbacks.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF8F6]/50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-[#4A3F35]">
                          {item.Customer?.name}
                        </p>
                        <p className="text-[10px] text-gray-400">{item.Customer?.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex text-[#D4AF37] gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < item.rating ? 'fill-current' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-[180px]">
                      <p className="font-bold text-[#4A3F35]">{item.Product?.name || "Store feedback"}</p>
                      {Array.isArray(item.images) && item.images.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {item.images.slice(0, 3).map((image, index) => (
                            <img key={`${image.url}-${index}`} src={image.url} alt="" className="w-9 h-9 rounded object-cover border" />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs italic leading-relaxed">
                      {item.title && <p className="not-italic font-bold text-[#4A3F35] mb-1">{item.title}</p>}
                      "{item.comment}"
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-[10px]">
                      {new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {activeTab === 'pending' && (
                        <button 
                          onClick={() => handleApprove(item.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Approve"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
