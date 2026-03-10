import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, Keyboard, ScrollView, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const API_KEY = '8781e84bef6d6f9563c506e1'; 

const LOCATION_DATA = {
  "🇮🇳 India": ["Mumbai", "Delhi", "Goa", "Bangalore", "Jaipur", "Hyderabad", "Kochi", "Chennai"],
  "🇻🇳 Vietnam": ["Hanoi", "Ho Chi Minh City", "Da Nang", "Phu Quoc", "Hoi An", "Sapa", "Nha Trang"],
  "🇹🇭 Thailand": ["Bangkok", "Phuket", "Chiang Mai", "Pattaya", "Krabi", "Koh Samui"],
  "🇯🇵 Japan": ["Tokyo", "Osaka", "Kyoto", "Sapporo"],
  "🇺🇸 USA": ["New York", "Los Angeles", "Chicago", "Las Vegas", "Miami"]
};

const CURRENCIES = [
  { label: "🇮🇳 INR (₹)", value: "INR", symbol: "₹" },
  { label: "🇺🇸 USD ($)", value: "USD", symbol: "$" },
  { label: "🇻🇳 VND (₫)", value: "VND", symbol: "₫" },
  { label: "🇪🇺 EUR (€)", value: "EUR", symbol: "€" },
  { label: "🇬🇧 GBP (£)", value: "GBP", symbol: "£" }
];

const CATEGORIES = ["🍔 Food", "🏨 Hotel", "🚕 Transport", "🛍️ Shopping", "🎟️ Other"];
const PAYMENTS = ["Cash 💵", "Credit Card 💳", "Debit Card 💳", "Forex Card 💳", "UPI 📲"];

export default function App() {
  const scrollRef = useRef(null);
  const [currentTab, setCurrentTab] = useState('Home');
  const [trips, setTrips] = useState({});
  const [tripBudgets, setTripBudgets] = useState({});
  const [activeTrip, setActiveTrip] = useState('My First Trip');
  const [masterCurrency, setMasterCurrency] = useState('INR');
  const [rates, setRates] = useState({});
  
  // Entry States
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('VND');
  const [paymentMethod, setPaymentMethod] = useState('Cash 💵');
  const [category, setCategory] = useState('🍔 Food');
  const [customCategory, setCustomCategory] = useState('');
  const [txType, setTxType] = useState('Debit');
  const [country, setCountry] = useState("🇮🇳 India");
  const [city, setCity] = useState("Mumbai");

  // Split Logic States
  const [isSplit, setIsSplit] = useState(false);
  const [splitNames, setSplitNames] = useState(''); // e.g. "Rahul, Amit"

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [newTripName, setNewTripName] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');

  const loadAllData = useCallback(async () => {
    const data = await AsyncStorage.getItem('@nexus_v6_pro');
    if (data) {
      const parsed = JSON.parse(data);
      setTrips(parsed.trips || {});
      setTripBudgets(parsed.budgets || {});
      setActiveTrip(parsed.activeTrip || 'My First Trip');
      setMasterCurrency(parsed.masterCurrency || 'INR');
    }
  }, []);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${masterCurrency}`);
      const data = await res.json();
      if (data.conversion_rates) setRates(data.conversion_rates);
    } catch (e) { console.log("Rate fetch failed"); }
  }, [masterCurrency]);

  useEffect(() => { loadAllData(); }, [loadAllData]);
  useEffect(() => { fetchRates(); }, [fetchRates]);

  const saveData = async (t, a, m, b) => {
    await AsyncStorage.setItem('@nexus_v6_pro', JSON.stringify({ trips: t, activeTrip: a, masterCurrency: m, budgets: b }));
  };

  const currentExpenses = useMemo(() => trips[activeTrip] || [], [trips, activeTrip]);
  const currentBudget = tripBudgets[activeTrip] || 0;
  
  const getConvertedAmount = useCallback((amount, fromCurrency) => {
    if (fromCurrency === masterCurrency) return amount;
    const rate = rates[fromCurrency];
    return rate ? amount / rate : amount;
  }, [rates, masterCurrency]);

  const formatValue = (n) => parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const getSymbol = (code) => CURRENCIES.find(c => c.value === code)?.symbol || "";

  const totals = useMemo(() => {
    let cash = 0, nonCash = 0;
    currentExpenses.forEach(e => {
      const amt = getConvertedAmount(e.amount_1, e.currency_1);
      const factor = e.type === 'Credit' ? -1 : 1;
      if (e.method === 'Cash 💵') cash += (amt * factor); else nonCash += (amt * factor);
    });
    return { cash, nonCash, grand: cash + nonCash };
  }, [currentExpenses, getConvertedAmount]);

  const budgetProgress = useMemo(() => {
    if (!currentBudget) return 0;
    return Math.min(totals.grand / currentBudget, 1);
  }, [totals.grand, currentBudget]);

  const handleSaveExpense = async () => {
    if (!amount1 || !description) return Alert.alert('Error', 'Fill all fields');
    if (isSplit && !splitNames) return Alert.alert('Split Info', 'Please enter names of friends involved');

    const finalCategory = category === "🎟️ Other" ? `🎟️ ${customCategory || 'Other'}` : category;
    const expenseData = { 
      id: editingId || Date.now().toString(), date, description, country, city, category: finalCategory,
      amount_1: parseFloat(amount1), currency_1: currency1, method: paymentMethod, type: txType, 
      split: isSplit, splitNames: splitNames 
    };

    let updatedList = editingId ? currentExpenses.map(item => item.id === editingId ? expenseData : item) : [expenseData, ...currentExpenses];
    updatedList.sort((a, b) => new Date(b.date) - new Date(a.date));

    const updatedTrips = { ...trips, [activeTrip]: updatedList };
    setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency, tripBudgets);
    
    setEditingId(null); setAmount1(''); setDescription(''); setCustomCategory(''); setIsSplit(false); setSplitNames(''); Keyboard.dismiss();
  };

  const startEdit = (item) => {
    setEditingId(item.id); setDate(item.date); setDescription(item.description); setAmount1(item.amount_1.toString());
    setCurrency1(item.currency_1); setPaymentMethod(item.method); setCountry(item.country); setCity(item.city); setTxType(item.type || 'Debit'); 
    setIsSplit(item.split || false); setSplitNames(item.splitNames || '');
    if (item.category.startsWith('🎟️') && !CATEGORIES.includes(item.category)) { setCategory('🎟️ Other'); setCustomCategory(item.category.replace('🎟️ ', '')); } else { setCategory(item.category); }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const deleteExpense = (id) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", onPress: () => {
        const updated = currentExpenses.filter(e => e.id !== id);
        const updatedTrips = { ...trips, [activeTrip]: updated };
        setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency, tripBudgets);
      }}
    ]);
  };

  const sharePDF = async () => {
    const symbol = getSymbol(masterCurrency);
    const html = `<html><body style="font-family:sans-serif;padding:20px;"><h1 style="text-align:center;">${activeTrip}</h1><h3 style="text-align:center;">Total: ${symbol}${formatValue(totals.grand)}</h3><table style="width:100%; border-collapse:collapse; margin-top:20px;"><thead><tr style="background:#f1f5f9;"><th>Date</th><th>Location</th><th>Desc</th><th>Method</th><th>Total (${masterCurrency})</th></tr></thead><tbody>${currentExpenses.map(e => `<tr><td style="border:1px solid #ddd;padding:8px;">${e.date}</td><td style="border:1px solid #ddd;padding:8px;">${e.city}</td><td style="border:1px solid #ddd;padding:8px;">${e.description}</td><td style="border:1px solid #ddd;padding:8px;">${e.method.split(' ')[0]}</td><td style="border:1px solid #ddd;padding:8px;">${e.type === 'Credit' ? '+' : ''}${formatValue(getConvertedAmount(e.amount_1, e.currency_1))}</td></tr>`).join('')}</tbody></table></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const renderHome = () => (
    <ScrollView ref={scrollRef} stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
        <Text style={styles.authorTag}>Made by Shitanshu Chokshi</Text>
        {currentBudget > 0 && (
          <View style={styles.budgetContainer}>
            <View style={styles.budgetHeader}>
              <Text style={styles.budgetLabel}>Budget Status</Text>
              <Text style={styles.budgetLabel}>{getSymbol(masterCurrency)}{formatValue(totals.grand)} / {formatValue(currentBudget)}</Text>
            </View>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${budgetProgress * 100}%`, backgroundColor: budgetProgress > 0.9 ? '#ef4444' : '#10b981' }]} /></View>
          </View>
        )}
        <View style={[styles.row, {marginTop: 15}]}>
          <View style={styles.tripPicker}><Picker style={{ color: '#000000' }} dropdownIconColor="#000000" selectedValue={activeTrip} onValueChange={(t) => setActiveTrip(t)}>{Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />)}</Picker></View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openTripModal('rename')}><Text>✏️</Text></TouchableOpacity>
          <TouchableOpacity style={styles.plusBtn} onPress={() => openTripModal('add')}><Text style={styles.plusText}>+</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputCard}>
        <View style={styles.row}>
           <TextInput style={[styles.input, {flex: 1}]} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" value={date} onChangeText={setDate} />
           <TouchableOpacity style={[styles.typeToggle, {backgroundColor: txType === 'Debit' ? '#fee2e2' : '#dcfce7'}]} onPress={() => setTxType(txType === 'Debit' ? 'Credit' : 'Debit')}><Text style={{color: txType === 'Debit' ? '#ef4444' : '#22c55e', fontWeight: 'bold'}}>{txType.toUpperCase()}</Text></TouchableOpacity>
        </View>
        
        {/* ADDED MARGIN HERE FOR SPACING */}
        <TextInput style={[styles.input, { color: '#000000', marginBottom: 15 }]} placeholder="Description" placeholderTextColor="#94a3b8" value={description} onChangeText={setDescription} />
        
        <View style={styles.row}>
          <View style={[styles.halfPicker, {marginRight: 5}]}>
             <Picker style={{ color: '#000000' }} dropdownIconColor="#000000" selectedValue={category} onValueChange={setCategory}>{CATEGORIES.map(c => <Picker.Item key={c} label={c} value={c} />)}</Picker>
          </View>
          <TextInput style={[styles.input, {flex: 1.2, color: '#000000'}]} placeholder="Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
          <TouchableOpacity style={styles.cameraBtn} onPress={() => Alert.alert("Coming Soon", "Camera/OCR logic is for Phase 3!")}><Text>📷</Text></TouchableOpacity>
        </View>

        {category === "🎟️ Other" && <TextInput style={[styles.input, {marginTop: 10, borderColor: '#10b981', borderWidth: 1}]} placeholder="Describe category..." placeholderTextColor="#94a3b8" value={customCategory} onChangeText={setCustomCategory} />}

        <View style={[styles.row, {marginTop: 10}]}>
          <View style={styles.halfPicker}><Picker style={{ color: '#000000' }} dropdownIconColor="#000000" selectedValue={currency1} onValueChange={setCurrency1}>{CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}</Picker></View>
          <View style={styles.halfPicker}><Picker style={{ color: '#000000' }} dropdownIconColor="#000000" selectedValue={paymentMethod} onValueChange={setPaymentMethod}>{PAYMENTS.map(p => <Picker.Item key={p} label={p} value={p} />)}</Picker></View>
        </View>

        <View style={styles.rowBetween}>
           <Text style={styles.subText}>Split with Friends?</Text>
           <TouchableOpacity onPress={() => setIsSplit(!isSplit)} style={[styles.splitToggle, isSplit && {backgroundColor: '#3b82f6'}]}><Text style={{color: isSplit ? 'white' : '#64748b', fontSize: 10, fontWeight: 'bold'}}>{isSplit ? 'YES 👥' : 'NO'}</Text></TouchableOpacity>
        </View>

        {isSplit && <TextInput style={[styles.input, {marginTop: 5, borderColor: '#3b82f6', borderWidth: 1}]} placeholder="Names (e.g. Rahul, Amit)" placeholderTextColor="#94a3b8" value={splitNames} onChangeText={setSplitNames} />}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}><Text style={styles.btnText}>{editingId ? 'UPDATE' : '+ ADD EXPENSE'}</Text></TouchableOpacity>
      </View>

      {currentExpenses.map((item) => {
        const converted = getConvertedAmount(item.amount_1, item.currency_1);
        const share = item.split ? converted / (item.splitNames.split(',').length + 1) : null;
        return (
          <TouchableOpacity key={item.id} style={styles.card} onPress={() => startEdit(item)}>
            <View style={{flex: 1}}>
              <Text style={styles.cardDate}>{item.date} {item.split ? '• 👥 Split' : ''}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              {item.split && <Text style={{fontSize: 10, color: '#3b82f6'}}>Share: {getSymbol(masterCurrency)}{formatValue(share)} per person</Text>}
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <Text style={[styles.cardAmt, {color: item.type === 'Credit' ? '#22c55e' : '#ef4444'}]}>{getSymbol(masterCurrency)}{formatValue(converted)}</Text>
              <TouchableOpacity onPress={() => deleteExpense(item.id)}><Text style={{color: 'red', fontSize: 18}}>×</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}
      
      {/* EXPORT BUTTON MOVED HERE TO BE VISIBLE */}
      <TouchableOpacity style={styles.mainExportBtn} onPress={sharePDF}><Text style={styles.btnText}>📤 EXPORT REPORT</Text></TouchableOpacity>
      <View style={{height: 120}} />
    </ScrollView>
  );

  const renderCharts = () => {
    const dataByCat = CATEGORIES.reduce((acc, cat) => {
      const total = currentExpenses.filter(e => e.category === cat || (cat === "🎟️ Other" && e.category.startsWith("🎟️"))).reduce((sum, e) => sum + getConvertedAmount(e.amount_1, e.currency_1), 0);
      acc[cat] = total; return acc;
    }, {});

    return (
      <ScrollView style={{flex: 1, padding: 20}}>
        <Text style={styles.appTitle}>ANALYTICS 📊</Text>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Category Breakdown</Text>
          {Object.entries(dataByCat).map(([cat, val]) => (
            <View key={cat} style={styles.rowBetween}>
              <Text style={styles.legendText}>{cat}</Text>
              <Text style={styles.legendText}>{getSymbol(masterCurrency)}{formatValue(val)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.summaryCard}>
           <Text style={styles.summaryTitle}>Split Summary</Text>
           <Text style={styles.legendText}>Total Split Expenses: {currentExpenses.filter(e => e.split).length}</Text>
        </View>
      </ScrollView>
    );
  };

  // Remaining Modal functions (openTripModal, handleTripSubmit) go here...
  const openTripModal = (mode) => { setModalMode(mode); setNewTripName(mode === 'rename' ? activeTrip : ''); setNewTripBudget(mode === 'rename' ? (tripBudgets[activeTrip] || '').toString() : ''); setModalVisible(true); };
  const handleTripSubmit = () => { if (!newTripName) return; const updatedTrips = { ...trips }; const updatedBudgets = { ...tripBudgets }; const bVal = parseFloat(newTripBudget) || 0; if (modalMode === 'add') { updatedTrips[newTripName] = []; updatedBudgets[newTripName] = bVal; setActiveTrip(newTripName); } else { updatedTrips[newTripName] = updatedTrips[activeTrip]; updatedBudgets[newTripName] = bVal; if (newTripName !== activeTrip) { delete updatedTrips[activeTrip]; delete updatedBudgets[activeTrip]; } setActiveTrip(newTripName); } setTrips(updatedTrips); setTripBudgets(updatedBudgets); saveData(updatedTrips, newTripName, masterCurrency, updatedBudgets); setModalVisible(false); };

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{modalMode === 'add' ? 'New Trip' : 'Edit Trip'}</Text>
          <TextInput style={styles.modalInput} value={newTripName} onChangeText={setNewTripName} placeholder="Trip Name" placeholderTextColor="#94a3b8" />
          <TextInput style={styles.modalInput} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Optional Budget" keyboardType="numeric" placeholderTextColor="#94a3b8" />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#ccc'}]} onPress={() => setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={handleTripSubmit}><Text style={{color:'white'}}>Save</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {currentTab === 'Home' ? renderHome() : renderCharts()}

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Home')}><Text style={[styles.tabIcon, currentTab === 'Home' && styles.activeTab]}>🏠</Text><Text style={[styles.tabText, currentTab === 'Home' && styles.activeTab]}>Home</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Charts')}><Text style={[styles.tabIcon, currentTab === 'Charts' && styles.activeTab]}>📊</Text><Text style={[styles.tabText, currentTab === 'Charts' && styles.activeTab]}>Charts</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, paddingTop: 40, backgroundColor: '#ffffff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  appTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  authorTag: { fontSize: 10, color: '#64748b', textAlign: 'center', marginBottom: 10 },
  budgetContainer: { marginTop: 15 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  budgetLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  progressBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  row: { flexDirection: 'row', marginBottom: 10, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 45, justifyContent: 'center' },
  iconBtn: { backgroundColor: '#f1f5f9', width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  plusText: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  inputCard: { backgroundColor: '#ffffff', margin: 15, padding: 15, borderRadius: 20, elevation: 3 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, color: '#000000' },
  cameraBtn: { backgroundColor: '#f1f5f9', width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center' },
  typeToggle: { paddingHorizontal: 12, height: 45, borderRadius: 12, justifyContent: 'center', marginLeft: 10 },
  splitToggle: { padding: 8, borderRadius: 8, backgroundColor: '#e2e8f0' },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  mainExportBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 12, alignItems: 'center', margin: 15 },
  btnText: { color: 'white', fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#ffffff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 16, borderLeftWidth: 4, borderColor: '#3b82f6' },
  cardDate: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold' },
  cardDesc: { color: '#1e293b', fontWeight: 'bold', fontSize: 15 },
  cardAmt: { fontWeight: 'bold', fontSize: 17 },
  subText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  tabBar: { flexDirection: 'row', backgroundColor: '#ffffff', borderTopWidth: 1, borderColor: '#e2e8f0', height: 70, paddingBottom: 10 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 24, color: '#94a3b8' },
  tabText: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold' },
  activeTab: { color: '#3b82f6' },
  summaryCard: { backgroundColor: '#ffffff', padding: 20, borderRadius: 20, marginBottom: 15, elevation: 2 },
  summaryTitle: { fontWeight: 'bold', color: '#1e293b', marginBottom: 10 },
  legendText: { color: '#64748b', marginBottom: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 24, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#000000' },
  modalInput: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, marginBottom: 15, color: '#000000' },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981' }
});
