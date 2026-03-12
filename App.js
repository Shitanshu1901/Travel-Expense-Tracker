import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, Keyboard, ScrollView, Modal, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const API_KEY = '8781e84bef6d6f9563c506e1'; 

const CATEGORIES = ["🍔 Food", "🏨 Hotel", "🚕 Transport", "🛍️ Shopping", "🎟️ Other"];
const PAYMENTS = ["Cash 💵", "Credit Card 💳", "Debit Card 💳", "Forex Card 💳", "UPI 📲"];
const CURRENCIES = [
  { label: "🇮🇳 INR (₹)", value: "INR", symbol: "₹" },
  { label: "🇺🇸 USD ($)", value: "USD", symbol: "$" },
  { label: "🇻🇳 VND (₫)", value: "VND", symbol: "₫" },
  { label: "🇪🇺 EUR (€)", value: "EUR", symbol: "€" },
  { label: "🇬🇧 GBP (£)", value: "GBP", symbol: "£" }
];

export default function App() {
  const scrollRef = useRef(null);
  const [currentTab, setCurrentTab] = useState('Home');
  const [trips, setTrips] = useState({});
  const [tripBudgets, setTripBudgets] = useState({});
  const [activeTrip, setActiveTrip] = useState('My First Trip');
  const [masterCurrency, setMasterCurrency] = useState('INR');
  const [rates, setRates] = useState({});
  
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('VND');
  const [paymentMethod, setPaymentMethod] = useState('Cash 💵');
  const [category, setCategory] = useState('🍔 Food');
  const [customCategory, setCustomCategory] = useState('');
  const [txType, setTxType] = useState('Debit');
  const [isSplit, setIsSplit] = useState(false);
  const [splitNames, setSplitNames] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [newTripName, setNewTripName] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');

  const loadAllData = useCallback(async () => {
    const v5 = await AsyncStorage.getItem('@nexus_v5_master');
    const v6 = await AsyncStorage.getItem('@nexus_v6_pro');
    let combinedTrips = {}, combinedBudgets = {}, mCurr = 'INR';
    if (v5) { combinedTrips = JSON.parse(v5).trips || {}; }
    if (v6) {
      const p = JSON.parse(v6);
      combinedTrips = { ...combinedTrips, ...p.trips };
      combinedBudgets = p.budgets || {};
      mCurr = p.masterCurrency || 'INR';
    }
    setTrips(combinedTrips); setTripBudgets(combinedBudgets); setMasterCurrency(mCurr);
    if (Object.keys(combinedTrips).length > 0) setActiveTrip(Object.keys(combinedTrips)[0]);
  }, []);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${masterCurrency}`);
      const d = await res.json();
      if (d.conversion_rates) setRates(d.conversion_rates);
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
      if (e.method === 'Cash 💵') cash += (amt * factor);
      else nonCash += (amt * factor);
    });
    return { cash, nonCash, grand: cash + nonCash };
  }, [currentExpenses, getConvertedAmount]);

  const handleSaveExpense = () => {
    if (!amount1 || !description) return Alert.alert('Error', 'Fill all fields');
    if (isSplit && !splitNames) return Alert.alert('Error', 'Enter names for split');
    const finalCat = category === "🎟️ Other" ? `🎟️ ${customCategory || 'Other'}` : category;
    const exp = { id: editingId || Date.now().toString(), date, description, category: finalCat, amount_1: parseFloat(amount1), currency_1: currency1, type: txType, method: paymentMethod, split: isSplit, splitNames };
    let updated = editingId ? currentExpenses.map(i => i.id === editingId ? exp : i) : [exp, ...currentExpenses];
    updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    const t = { ...trips, [activeTrip]: updated };
    setTrips(t); saveData(t, activeTrip, masterCurrency, tripBudgets);
    setEditingId(null); setAmount1(''); setDescription(''); setIsSplit(false); setSplitNames(''); Keyboard.dismiss();
  };

  const startEdit = (item) => {
    setEditingId(item.id); setDate(item.date); setDescription(item.description); setAmount1(item.amount_1.toString());
    setCurrency1(item.currency_1); setPaymentMethod(item.method); setTxType(item.type || 'Debit');
    setIsSplit(item.split || false); setSplitNames(item.splitNames || '');
    if (item.category.startsWith('🎟️') && !CATEGORIES.includes(item.category)) { setCategory('🎟️ Other'); setCustomCategory(item.category.replace('🎟️ ', '')); } else { setCategory(item.category); }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const sharePDF = async () => {
    const symbol = getSymbol(masterCurrency);
    const html = `<html><body style="font-family:sans-serif;padding:20px;"><h1 style="text-align:center;">${activeTrip} Report</h1><h3 style="text-align:center;">Total Spent: ${symbol}${formatValue(totals.grand)}</h3><table style="width:100%;border-collapse:collapse;margin-top:20px;"><thead><tr style="background:#f1f5f9;"><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Original Amt</th><th>Total (${masterCurrency})</th></tr></thead><tbody>${currentExpenses.map(e => `<tr><td style="border:1px solid #ddd;padding:8px;">${e.date}</td><td style="border:1px solid #ddd;padding:8px;">${e.category}</td><td style="border:1px solid #ddd;padding:8px;">${e.description}</td><td style="border:1px solid #ddd;padding:8px;">${e.method}</td><td style="border:1px solid #ddd;padding:8px;">${formatValue(e.amount_1)} ${e.currency_1}</td><td style="border:1px solid #ddd;padding:8px;">${symbol}${formatValue(getConvertedAmount(e.amount_1, e.currency_1))}</td></tr>`).join('')}</tbody></table></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const renderHome = () => (
    <ScrollView ref={scrollRef} stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
        <View style={styles.homeCurrencyRow}>
            <Text style={styles.subText}>Home Currency: </Text>
            <View style={styles.currencyPickerWrapper}>
              <Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={masterCurrency} onValueChange={(m) => { setMasterCurrency(m); saveData(trips, activeTrip, m, tripBudgets); }}>
                {CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
              </Picker>
            </View>
        </View>
        <View style={styles.row}>
          <View style={styles.tripPicker}><Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={activeTrip} onValueChange={setActiveTrip}>{Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />)}</Picker></View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => {setModalMode('rename'); setModalVisible(true)}}><Text>✏️</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, {backgroundColor: '#fee2e2'}]} onPress={() => Alert.alert("Confirm", "Delete trip?", [{text:"No"},{text:"Yes",onPress:()=> {const t={...trips}; delete t[activeTrip]; const next=Object.keys(t)[0]||'My Trip'; setTrips(t); setActiveTrip(next); saveData(t,next,masterCurrency,tripBudgets);}}])}><Text>🗑️</Text></TouchableOpacity>
          <TouchableOpacity style={styles.plusBtn} onPress={() => {setModalMode('add'); setModalVisible(true)}}><Text style={styles.plusText}>+</Text></TouchableOpacity>
        </View>
        <View style={styles.summaryCardCompact}>
            <Text style={styles.legendText}>🟢 Cash: {getSymbol(masterCurrency)}{formatValue(totals.cash)}</Text>
            <Text style={styles.legendText}>🔵 Card/UPI: {getSymbol(masterCurrency)}{formatValue(totals.nonCash)}</Text>
        </View>
        <Text style={styles.grandTotalText}>Grand Total: {getSymbol(masterCurrency)}{formatValue(totals.grand)}</Text>
        {currentBudget > 0 && (
          <View style={styles.budgetContainer}>
            <View style={styles.budgetHeader}><Text style={styles.budgetLabel}>Budget Status</Text><Text style={styles.budgetLabel}>{getSymbol(masterCurrency)}{formatValue(totals.grand)} / {formatValue(currentBudget)}</Text></View>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${Math.min(totals.grand/currentBudget, 1)*100}%`, backgroundColor: (totals.grand/currentBudget) > 0.9 ? '#ef4444' : '#10b981' }]} /></View>
          </View>
        )}
      </View>

      <View style={styles.inputCard}>
        <View style={styles.row}>
          <TextInput style={[styles.input, {flex:1, color:'#000'}]} value={date} onChangeText={setDate} />
          <TouchableOpacity style={[styles.typeToggle, {backgroundColor: txType === 'Debit' ? '#fee2e2' : '#dcfce7'}]} onPress={() => setTxType(txType === 'Debit' ? 'Credit' : 'Debit')}><Text style={{color: txType === 'Debit' ? '#ef4444' : '#22c55e', fontWeight: 'bold'}}>{txType.toUpperCase()}</Text></TouchableOpacity>
        </View>
        <TextInput style={[styles.input, {marginVertical: 10, color:'#000'}]} placeholder="Description" value={description} onChangeText={setDescription} />
        <View style={styles.row}>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={category} onValueChange={setCategory}>{CATEGORIES.map(c => <Picker.Item key={c} label={c} value={c} />)}</Picker></View>
          <TextInput style={[styles.input, {flex: 1, color:'#000'}]} placeholder="Amount" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
        </View>
        <View style={[styles.row, {marginTop:10}]}>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={currency1} onValueChange={setCurrency1}>{CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}</Picker></View>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={paymentMethod} onValueChange={setPaymentMethod}>{PAYMENTS.map(p => <Picker.Item key={p} label={p} value={p} />)}</Picker></View>
        </View>
        <View style={[styles.rowBetween, {marginTop: 10}]}>
          <Text style={{fontWeight:'bold', color:'#000'}}>Split with Friends?</Text>
          <TouchableOpacity onPress={() => setIsSplit(!isSplit)} style={[styles.splitToggle, isSplit && {backgroundColor: '#3b82f6'}]}><Text style={{color: isSplit ? '#fff' : '#000'}}>👥 {isSplit ? 'YES' : 'NO'}</Text></TouchableOpacity>
        </View>
        {isSplit && <TextInput style={[styles.input, {marginTop: 10, color:'#000', borderColor: '#3b82f6', borderWidth: 1}]} placeholder="Names (e.g. Ajay, Nikhil)" value={splitNames} onChangeText={setSplitNames} />}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}><Text style={styles.btnText}>{editingId ? 'UPDATE EXPENSE' : '+ ADD ENTRY'}</Text></TouchableOpacity>
      </View>

      {currentExpenses.map(item => {
        const conv = getConvertedAmount(item.amount_1, item.currency_1);
        const rate = rates[item.currency_1] ? (1 / rates[item.currency_1]).toFixed(4) : "1.00";
        // SPLIT SHARE LOGIC RESTORED FOR HOME CARDS
        const friendsCount = item.split && item.splitNames ? item.splitNames.split(',').length + 1 : 1;
        const share = conv / friendsCount;

        return (
          <TouchableOpacity key={item.id} style={styles.card} onPress={() => startEdit(item)}>
            <View style={{flex: 1}}>
                <Text style={styles.cardDate}>{item.date} • {item.method.split(' ')[0]}</Text>
                <Text style={styles.cardDesc}>{item.description} ({item.category})</Text>
                <Text style={styles.rateText}>Rate: 1 {item.currency_1} = {rate} {masterCurrency}</Text>
                {/* RESTORED SPLIT DISPLAY BELOW */}
                {item.split && <Text style={styles.splitSubText}>Share: {getSymbol(masterCurrency)}{formatValue(share)} per person (Total Split: {friendsCount})</Text>}
            </View>
            <View style={{alignItems: 'flex-end'}}>
                <Text style={[styles.cardAmt, {color: item.type === 'Credit' ? '#22c55e' : '#ef4444'}]}>{getSymbol(masterCurrency)}{formatValue(conv)}</Text>
                <TouchableOpacity onPress={() => Alert.alert("Confirm","Delete expense?",[{text:"No"},{text:"Yes",onPress:()=> {const u=currentExpenses.filter(e=>e.id!==item.id); const t={...trips,[activeTrip]:u}; setTrips(t); saveData(t,activeTrip,masterCurrency,tripBudgets);}}])}><Text style={{color:'red',fontSize:20}}>×</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={styles.exportBtn} onPress={sharePDF}><Text style={styles.btnText}>📤 EXPORT PDF REPORT</Text></TouchableOpacity>
      <View style={{height: 150}} />
    </ScrollView>
  );

  const renderCharts = () => {
    const settlements = {};
    currentExpenses.filter(e => e.split && e.splitNames).forEach(e => {
        const friends = e.splitNames.split(',').map(n => n.trim()).filter(n => n);
        if (friends.length > 0) {
            const share = getConvertedAmount(e.amount_1, e.currency_1) / (friends.length + 1);
            friends.forEach(f => { settlements[f] = (settlements[f] || 0) + share; });
        }
    });
    return (
        <ScrollView style={{flex:1, padding: 20}}>
          <View style={{height: 30}} />
          <Text style={styles.appTitle}>ANALYTICS 📊</Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Spending by Category</Text>
            {CATEGORIES.map(cat => {
              const total = currentExpenses.filter(e => e.category.includes(cat)).reduce((s, e) => s + getConvertedAmount(e.amount_1, e.currency_1), 0);
              const perc = totals.grand > 0 ? (total / totals.grand) * 100 : 0;
              return (
                <View key={cat} style={{marginBottom: 15}}><View style={styles.rowBetween}><Text style={{color:'#000',fontWeight:'bold'}}>{cat}</Text><Text style={{color:'#000'}}>{perc.toFixed(0)}%</Text></View><View style={styles.progressBarBg}><View style={[styles.progressBarFill, {width: `${perc}%`, backgroundColor: '#3b82f6'}]} /></View></View>
              );
            })}
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Who Owes You? 👥</Text>
            {Object.keys(settlements).length > 0 ? Object.entries(settlements).map(([n, a]) => (<View key={n} style={styles.rowBetween}><Text style={{color:'#000',fontWeight:'bold'}}>{n}</Text><Text style={{color:'#10b981',fontWeight:'bold'}}>owes {getSymbol(masterCurrency)}{formatValue(a)}</Text></View>)) : <Text style={{color:'#64748b',fontSize:12}}>No split expenses recorded yet.</Text>}
          </View>
          <View style={{height: 100}} />
        </ScrollView>
    );
  };

  const renderFeatures = () => (
    <ScrollView style={{flex:1, padding: 20}}>
      <View style={{height: 40}} />
      <Text style={[styles.appTitle, {marginBottom: 10}]}>WHAT'S NEW 🚀</Text>
      <View style={[styles.summaryCard, {backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1}]}>
        <Text style={{fontWeight: '900', color: '#1e293b', fontSize: 16, marginBottom: 5}}>Travel Expense Tracker</Text>
        <Text style={{fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 10}}>A professional tool built to manage international spending, split costs with friends, and monitor budgets in real-time.</Text>
        <View style={{height: 1, backgroundColor: '#c7d2fe', marginBottom: 10}} />
        <Text style={{fontWeight: 'bold', color: '#3b82f6', fontSize: 11}}>DESIGNED & DEVELOPED BY:</Text>
        <Text style={{fontWeight: '900', color: '#1e293b', fontSize: 15, marginTop: 2}}>Shitanshu Chokshi</Text>
      </View>
      <View style={[styles.summaryCard, { padding: 0, overflow: 'hidden', height: 400, backgroundColor: '#f1f5f9' }]}>
        <Image source={{ uri: 'https://github.com/Shitanshu1901/Travel-Expense-Tracker/blob/3a493f3497b541241ce16de155d3d4ff18444bff/App%20Infographic.png' }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>🌍 Smart Currency Engine</Text>
        <Text style={styles.featureListText}>• Real-Time Home Currency Switching</Text>
        <Text style={styles.featureListText}>• Live Exchange Rates via API</Text>
        <Text style={styles.featureListText}>• Historical Rate Tracking saved on cards</Text>
        <Text style={styles.featureListText}>• Dual Visibility of rates</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>👥 Split-Cost Management</Text>
        <Text style={styles.featureListText}>• Multi-Person Splitting toggle</Text>
        <Text style={styles.featureListText}>• Per-person share display on expenses</Text>
        <Text style={styles.featureListText}>• "Who Owes Whom" settlement engine</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>📊 Analytics & Budgeting</Text>
        <Text style={styles.featureListText}>• Optional Trip Budgeting limits</Text>
        <Text style={styles.featureListText}>• Visual Budget Health Progress Bar</Text>
        <Text style={styles.featureListText}>• Category Spending visual graphs</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>📝 Seamless Data Management</Text>
        <Text style={styles.featureListText}>• Quick-Edit on any entry to instantly "scroll-to-top" to edit </Text>
        <Text style={styles.featureListText}>• Double-Verification Security of Deletion of data</Text>
        <Text style={styles.featureListText}>• Multi-Trip Storage</Text>
        <Text style={styles.featureListText}>• Intelligent "Other" Category for custom edits</Text>
      </View>
     <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>📤 Professional Reporting</Text>
        <Text style={styles.featureListText}>• One-Tap PDF Export</Text>
        <Text style={styles.featureListText}>• Detailed Documentation when exported</Text>
      </View>
      <View style={{height: 120}} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{modalMode === 'add' ? 'New Trip' : 'Edit Trip'}</Text>
          <TextInput style={[styles.modalInput, {color:'#000'}]} value={newTripName} onChangeText={setNewTripName} placeholder="Trip Name" />
          <TextInput style={[styles.modalInput, {color:'#000'}]} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Budget (Optional)" keyboardType="numeric" />
          <View style={styles.row}><TouchableOpacity style={[styles.modalBtn, {backgroundColor:'#ccc'}]} onPress={() => setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.modalBtn} onPress={() => { if (!newTripName) return; const t = { ...trips }; const b = { ...tripBudgets }; if (modalMode === 'add') { t[newTripName] = []; b[newTripName] = parseFloat(newTripBudget) || 0; setActiveTrip(newTripName); } else { t[newTripName] = t[activeTrip]; b[newTripName] = parseFloat(newTripBudget) || 0; if (newTripName !== activeTrip) { delete t[activeTrip]; delete b[activeTrip]; } setActiveTrip(newTripName); } setTrips(t); setTripBudgets(b); saveData(t, newTripName, masterCurrency, b); setModalVisible(false); }}><Text style={{color:'#fff'}}>Save</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
      {currentTab === 'Home' ? renderHome() : currentTab === 'Charts' ? renderCharts() : renderFeatures()}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Home')}><Text style={[styles.tabIcon, currentTab === 'Home' && styles.activeTab]}>🏠</Text><Text style={[styles.tabText, currentTab === 'Home' && styles.activeTab]}>Home</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Charts')}><Text style={[styles.tabIcon, currentTab === 'Charts' && styles.activeTab]}>📊</Text><Text style={[styles.tabText, currentTab === 'Charts' && styles.activeTab]}>Charts</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Features')}><Text style={[styles.tabIcon, currentTab === 'Features' && styles.activeTab]}>✨</Text><Text style={[styles.tabText, currentTab === 'Features' && styles.activeTab]}>Features</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, paddingTop: 45, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  appTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  homeCurrencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  currencyPickerWrapper: { width: 140, backgroundColor: '#f1f5f9', borderRadius: 10, height: 40, justifyContent: 'center' },
  subText: { color: '#64748b', fontSize: 13, fontWeight: 'bold' },
  budgetContainer: { marginTop: 10 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  budgetLabel: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  progressBarBg: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryCardCompact: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f1f5f9', padding: 10, borderRadius: 10, marginTop: 10 },
  grandTotalText: { textAlign: 'center', fontSize: 16, fontWeight: '900', color: '#10b981', marginTop: 10 },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, height: 45, justifyContent: 'center' },
  iconBtn: { backgroundColor: '#f1f5f9', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  plusText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  inputCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 20, elevation: 5 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, color: '#000' },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center', marginRight: 5 },
  typeToggle: { paddingHorizontal: 15, height: 45, borderRadius: 12, justifyContent: 'center', marginLeft: 10 },
  splitToggle: { padding: 10, borderRadius: 10, backgroundColor: '#e2e8f0' },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  exportBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 12, alignItems: 'center', margin: 15 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 16, borderLeftWidth: 5, borderColor: '#3b82f6', elevation: 2 },
  cardDate: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold' },
  cardDesc: { fontWeight: 'bold', fontSize: 14, color: '#1e293b' },
  cardAmt: { fontWeight: 'bold', fontSize: 16 },
  rateText: { fontSize: 10, color: '#10b981', fontWeight: 'bold', marginTop: 4 },
  splitSubText: { fontSize: 10, color: '#3b82f6', marginTop: 2, fontStyle: 'italic' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', height: 95, borderTopWidth: 1, borderColor: '#e2e8f0', paddingBottom: 40 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 22, color: '#94a3b8' },
  tabText: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold' },
  activeTab: { color: '#3b82f6' },
  summaryCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, elevation: 3, marginBottom: 15 },
  summaryTitle: { fontWeight: 'bold', marginBottom: 15, color: '#1e293b', fontSize: 16 },
  featureListText: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 25, borderRadius: 25, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalInput: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, marginBottom: 15 },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981' }
});
