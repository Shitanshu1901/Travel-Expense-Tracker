import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, ScrollView, Modal, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
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

const LOCATIONS = [
  { country: "🇮🇳 India", cities: ["Mumbai", "Delhi", "Goa", "Bangalore"] },
  { country: "🇻🇳 Vietnam", cities: ["Hanoi", "Ho Chi Minh", "Da Nang", "Hoi An"] },
  { country: "🇺🇸 USA", cities: ["New York", "LA", "Vegas", "Chicago"] },
  { country: "🇪🇺 Europe", cities: ["Paris", "London", "Rome", "Amsterdam"] }
];

export default function App() {
  const scrollRef = useRef(null);
  const [currentTab, setCurrentTab] = useState('Home');
  const [trips, setTrips] = useState({});
  const [tripBudgets, setTripBudgets] = useState({});
  const [activeTrip, setActiveTrip] = useState('');
  const [masterCurrency, setMasterCurrency] = useState('INR');
  const [rates, setRates] = useState({});
  
  // Form States
  const [editingId, setEditingId] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateObj, setDateObj] = useState(new Date());
  const [isDateSelected, setIsDateSelected] = useState(false);
  const [txType, setTxType] = useState('Debit');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [splitNames, setSplitNames] = useState('');

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [newTripName, setNewTripName] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');
  
  // Wallet Sync Modal States
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncAmount, setSyncAmount] = useState('');
  const [syncCurrency, setSyncCurrency] = useState('VND');

  const loadAllData = useCallback(async () => {
    const v6 = await AsyncStorage.getItem('@nexus_v6_pro');
    if (v6) {
      const p = JSON.parse(v6);
      setTrips(p.trips || {});
      setTripBudgets(p.budgets || {});
      setMasterCurrency(p.masterCurrency || 'INR');
      if (p.activeTrip) setActiveTrip(p.activeTrip);
    }
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

  const currentExpenses = useMemo(() => (activeTrip ? trips[activeTrip] || [] : []), [trips, activeTrip]);
  const currentBudget = tripBudgets[activeTrip] || 0;
  
  const getConvertedAmount = useCallback((amount, fromCurrency) => {
    if (fromCurrency === masterCurrency) return amount;
    const rate = rates[fromCurrency];
    return rate ? amount / rate : amount;
  }, [rates, masterCurrency]);

  const formatValue = (n) => parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const getSymbol = (code) => CURRENCIES.find(c => c.value === code)?.symbol || "";

  const resetForm = () => {
    setEditingId(null); setDateObj(new Date()); setIsDateSelected(false); setTxType('Debit');
    setCountry(''); setCity(''); setDescription(''); setCategory(''); setCustomCategory('');
    setAmount1(''); setCurrency1(''); setPaymentMethod(''); setIsSplit(false); setSplitNames('');
  };

  const totals = useMemo(() => {
    let cash = 0, nonCash = 0, splitsTotal = 0;
    currentExpenses.forEach(e => {
      const amt = getConvertedAmount(e.amount_1, e.currency_1);
      const factor = e.type === 'Credit' ? -1 : 1;
      
      if (e.method === 'Cash 💵') cash += (amt * factor);
      else nonCash += (amt * factor);
      
      if (e.split && e.splitNames) {
         const sf = e.splitNames.split(',').length + 1;
         splitsTotal += ((amt / sf) * factor); 
      }
    });
    return { cash, nonCash, grand: cash + nonCash, splitsTotal };
  }, [currentExpenses, getConvertedAmount]);

  // SMART WALLET SYNC ENGINE
  const handleWalletSync = () => {
    const actualAmount = parseFloat(syncAmount);
    if (isNaN(actualAmount)) return Alert.alert('Error', 'Enter a valid amount');

    // Calculate current recorded cash balance in that specific currency
    let currentBalance = 0;
    currentExpenses.forEach(e => {
      if (e.method === 'Cash 💵' && e.currency_1 === syncCurrency) {
         currentBalance += e.type === 'Credit' ? e.amount_1 : -e.amount_1;
      }
    });

    const difference = actualAmount - currentBalance;

    if (difference === 0) {
      Alert.alert("All Good!", "Your physical wallet already perfectly matches the app.");
      setSyncModalVisible(false); return;
    }

    const exp = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      type: difference > 0 ? 'Credit' : 'Debit',
      country: 'Auto', city: 'Wallet Sync',
      description: 'Wallet Sync Auto-Correction',
      category: '🎟️ Other',
      amount_1: Math.abs(difference),
      currency_1: syncCurrency,
      method: 'Cash 💵',
      split: false, splitNames: ''
    };

    const updated = [exp, ...currentExpenses];
    const t = { ...trips, [activeTrip]: updated };
    setTrips(t); saveData(t, activeTrip, masterCurrency, tripBudgets);
    
    setSyncModalVisible(false); setSyncAmount('');
    Alert.alert("Wallet Synced!", "An adjustment entry has been made to perfectly match your physical cash.");
  };

  const handleSaveExpense = () => {
    if (!isDateSelected || !country || !city || !description || !category || !amount1 || !currency1 || !paymentMethod) {
      return Alert.alert('Error', 'Please fill out all fields before saving.');
    }
    const finalCat = category === "🎟️ Other" ? `🎟️ ${customCategory || 'Other'}` : category;
    
    const exp = { 
      id: editingId || Date.now().toString(), date: dateObj.toISOString().split('T')[0], 
      type: txType, country, city, description, category: finalCat, 
      amount_1: parseFloat(amount1), currency_1: currency1, method: paymentMethod, split: isSplit, splitNames 
    };
    
    let updated = editingId ? currentExpenses.map(i => i.id === editingId ? exp : i) : [exp, ...currentExpenses];
    updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const t = { ...trips, [activeTrip]: updated };
    setTrips(t); saveData(t, activeTrip, masterCurrency, tripBudgets);
    resetForm(); 
  };

  const startEdit = (item) => {
    setEditingId(item.id); setDateObj(new Date(item.date)); setIsDateSelected(true);
    setTxType(item.type || 'Debit'); setCountry(item.country || ''); setCity(item.city || '');
    setDescription(item.description); setAmount1(item.amount_1.toString()); setCurrency1(item.currency_1); 
    setPaymentMethod(item.method); setIsSplit(item.split || false); setSplitNames(item.splitNames || ''); 
    
    if (item.category.startsWith('🎟️')) { setCategory("🎟️ Other"); setCustomCategory(item.category.replace('🎟️ ', '')); } 
    else { setCategory(item.category); }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleTripSave = () => {
    if (!newTripName) return;
    const t = { ...trips }; const b = { ...tripBudgets };
    if (modalMode === 'add') { t[newTripName] = []; b[newTripName] = parseFloat(newTripBudget) || 0; setActiveTrip(newTripName); } 
    else {
      if (newTripName !== activeTrip) { t[newTripName] = t[activeTrip]; delete t[activeTrip]; b[newTripName] = parseFloat(newTripBudget) || 0; delete b[activeTrip]; setActiveTrip(newTripName); } 
      else { b[activeTrip] = parseFloat(newTripBudget) || 0; }
    }
    setTrips(t); setTripBudgets(b); saveData(t, newTripName, masterCurrency, b);
    setModalVisible(false); resetForm(); 
  };

  const confirmDeleteTrip = () => {
    Alert.alert("Delete Trip", `Are you sure you want to delete ${activeTrip}?`, [
      { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => {
          const t = { ...trips }; const b = { ...tripBudgets }; delete t[activeTrip]; delete b[activeTrip];
          const next = Object.keys(t)[0] || ''; setTrips(t); setTripBudgets(b); setActiveTrip(next); saveData(t, next, masterCurrency, b); resetForm();
      }}
    ]);
  };

  const confirmDeleteExpense = (itemId) => {
    Alert.alert("Delete Expense", "Are you sure you want to delete this entry?", [
      { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => {
          const u = currentExpenses.filter(e => e.id !== itemId); const t = { ...trips, [activeTrip]: u }; 
          setTrips(t); saveData(t, activeTrip, masterCurrency, tripBudgets); resetForm();
      }}
    ]);
  };

  const sharePDF = async () => {
    const symbol = getSymbol(masterCurrency);
    const hasSplits = currentExpenses.some(e => e.split); 

    let tableHeader = hasSplits 
      ? `<th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Orig. Amt</th><th>Split With</th><th>Split Amt</th><th>Total (${masterCurrency})</th>`
      : `<th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Orig. Amt</th><th>Total (${masterCurrency})</th>`;

    const html = `<html><body style="font-family:sans-serif;padding:20px;">
      <h1 style="text-align:center;">${activeTrip} Report</h1>
      <div style="background:#f1f5f9; padding:15px; border-radius:10px; margin-bottom:20px;">
        <p><strong>Grand Total:</strong> ${symbol}${formatValue(totals.grand)}</p>
        <p>Cash: ${symbol}${formatValue(totals.cash)} | Card/UPI: ${symbol}${formatValue(totals.nonCash)} ${hasSplits ? `| Your Split Share Total: ${symbol}${formatValue(totals.splitsTotal)}` : ''}</p>
      </div>
      <table style="width:100%;border-collapse:collapse; text-align:left;">
        <tr style="background:#3b82f6; color:#fff;">${tableHeader}</tr>
        ${currentExpenses.map(e => {
          const totalConv = getConvertedAmount(e.amount_1, e.currency_1);
          const sf = e.split ? (e.splitNames.split(',').length + 1) : 1;
          if (hasSplits) {
            return `<tr><td style="border:1px solid #ddd;padding:5px;">${e.date}</td><td style="border:1px solid #ddd;padding:5px;">${e.category}</td><td style="border:1px solid #ddd;padding:5px;">${e.description}</td><td style="border:1px solid #ddd;padding:5px;">${e.method}</td><td style="border:1px solid #ddd;padding:5px;">${e.amount_1} ${e.currency_1}</td><td style="border:1px solid #ddd;padding:5px;">${e.split ? e.splitNames : '-'}</td><td style="border:1px solid #ddd;padding:5px;">${e.split ? `${symbol}${formatValue(totalConv/sf)}` : '-'}</td><td style="border:1px solid #ddd;padding:5px;">${symbol}${formatValue(totalConv)}</td></tr>`;
          } else {
            return `<tr><td style="border:1px solid #ddd;padding:5px;">${e.date}</td><td style="border:1px solid #ddd;padding:5px;">${e.category}</td><td style="border:1px solid #ddd;padding:5px;">${e.description}</td><td style="border:1px solid #ddd;padding:5px;">${e.method}</td><td style="border:1px solid #ddd;padding:5px;">${e.amount_1} ${e.currency_1}</td><td style="border:1px solid #ddd;padding:5px;">${symbol}${formatValue(totalConv)}</td></tr>`;
          }
        }).join('')}
      </table></body></html>`;

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
          <View style={styles.tripPicker}><Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={activeTrip} onValueChange={(val) => {setActiveTrip(val); resetForm();}}><Picker.Item label="Select Trip" value="" />{Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />)}</Picker></View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => {setModalMode('edit'); setNewTripName(activeTrip); setNewTripBudget(currentBudget.toString()); setModalVisible(true)}}><Text>✏️</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, {backgroundColor: '#fee2e2'}]} onPress={confirmDeleteTrip}><Text>🗑️</Text></TouchableOpacity>
          <TouchableOpacity style={styles.plusBtn} onPress={() => {setModalMode('add'); setNewTripName(''); setNewTripBudget(''); setModalVisible(true)}}><Text style={styles.plusText}>+</Text></TouchableOpacity>
        </View>

        <View style={styles.summaryCardCompact}>
            <Text style={styles.legendText}>🟢 Cash: {getSymbol(masterCurrency)}{formatValue(totals.cash)}</Text>
            <Text style={styles.legendText}>🔵 Card: {getSymbol(masterCurrency)}{formatValue(totals.nonCash)}</Text>
            {totals.splitsTotal > 0 && <Text style={styles.legendText}>🟣 Splits: {getSymbol(masterCurrency)}{formatValue(totals.splitsTotal)}</Text>}
        </View>
        
        {/* NEW: Wallet Sync Button */}
        <TouchableOpacity style={styles.syncBtn} onPress={() => {setSyncAmount(''); setSyncModalVisible(true);}}>
            <Text style={styles.syncBtnText}>⚖️ Auto-Sync Physical Wallet</Text>
        </TouchableOpacity>
        
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
          <TouchableOpacity style={[styles.dateSelector, {flex: 1}]} onPress={() => setShowDatePicker(true)}>
            <Text style={{color: '#000'}}>{isDateSelected ? `📅 ${dateObj.toLocaleDateString('en-GB')}` : '📅 Select Date'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.typeToggle, {backgroundColor: txType === 'Debit' ? '#fee2e2' : '#dcfce7'}]} onPress={() => setTxType(txType === 'Debit' ? 'Credit' : 'Debit')}><Text style={{color: txType === 'Debit' ? '#ef4444' : '#22c55e', fontWeight: 'bold'}}>{txType.toUpperCase()}</Text></TouchableOpacity>
        </View>
        {showDatePicker && (<DateTimePicker value={dateObj} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if(d) {setDateObj(d); setIsDateSelected(true);} }} />)}
        
        <View style={[styles.row, {marginTop:10}]}>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={country} onValueChange={setCountry}>
            <Picker.Item label="Select Country" value="" />{LOCATIONS.map(l => <Picker.Item key={l.country} label={l.country} value={l.country} />)}
          </Picker></View>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={city} onValueChange={setCity}>
            <Picker.Item label="Select City" value="" />{country ? LOCATIONS.find(l => l.country === country)?.cities.map(c => <Picker.Item key={c} label={c} value={c} />) : null}
          </Picker></View>
        </View>

        <TextInput style={[styles.input, {marginVertical: 10, color:'#000'}]} placeholder="Description" placeholderTextColor="#94a3b8" value={description} onChangeText={setDescription} />
        
        <View style={styles.row}>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={category} onValueChange={setCategory}>
            <Picker.Item label="Select Category" value="" />{CATEGORIES.map(c => <Picker.Item key={c} label={c} value={c} />)}
          </Picker></View>
          <TextInput style={[styles.input, {flex: 1, color:'#000'}]} placeholder="Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
        </View>

        {category === "🎟️ Other" && (<TextInput style={[styles.input, {marginTop: 10, borderColor:'#10b981', borderWidth:1, color:'#000'}]} placeholder="Describe other category..." placeholderTextColor="#94a3b8" value={customCategory} onChangeText={setCustomCategory} />)}

        <View style={[styles.row, {marginTop:10}]}>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={currency1} onValueChange={setCurrency1}>
            <Picker.Item label="Select Currency" value="" />{CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
          </Picker></View>
          <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={paymentMethod} onValueChange={setPaymentMethod}>
            <Picker.Item label="Select Payment" value="" />{PAYMENTS.map(p => <Picker.Item key={p} label={p} value={p} />)}
          </Picker></View>
        </View>

        <View style={[styles.rowBetween, {marginTop: 10}]}>
          <Text style={{fontWeight:'bold', color:'#000'}}>Split with Friends?</Text>
          <TouchableOpacity onPress={() => setIsSplit(!isSplit)} style={[styles.splitToggle, isSplit && {backgroundColor: '#3b82f6'}]}><Text style={{color: isSplit ? '#fff' : '#000'}}>👥 {isSplit ? 'YES' : 'NO'}</Text></TouchableOpacity>
        </View>
        {isSplit && <TextInput style={[styles.input, {marginTop: 10, color:'#000', borderColor: '#3b82f6', borderWidth: 1}]} placeholder="Names (e.g. Ajay, Rahul)" placeholderTextColor="#94a3b8" value={splitNames} onChangeText={setSplitNames} />}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}><Text style={styles.btnText}>{editingId ? 'UPDATE ENTRY' : '+ ADD EXPENSE'}</Text></TouchableOpacity>
      </View>

      {currentExpenses.map(item => {
        const conv = getConvertedAmount(item.amount_1, item.currency_1);
        const rate = rates[item.currency_1] ? (1 / rates[item.currency_1]).toFixed(4) : "1.00";
        const sf = item.split && item.splitNames ? item.splitNames.split(',').length + 1 : 1;
        return (
          <TouchableOpacity key={item.id} style={styles.card} onPress={() => startEdit(item)}>
            <View style={{flex: 1}}>
                <Text style={styles.cardDate}>{item.date} • {item.city}</Text>
                <Text style={styles.cardDesc}>{item.description}</Text>
                <Text style={styles.cardCategory}>Category: {item.category}</Text>
                <Text style={styles.cardOrigAmt}>Original: {formatValue(item.amount_1)} {item.currency_1}</Text>
                <Text style={styles.rateText}>Rate: 1 {item.currency_1} = {rate} {masterCurrency}</Text>
                {item.split && <Text style={styles.splitSubText}>👥 Share: {getSymbol(masterCurrency)}{formatValue(conv/sf)} per person</Text>}
            </View>
            <View style={{alignItems: 'flex-end'}}>
                <Text style={[styles.cardAmt, {color: item.type === 'Credit' ? '#22c55e' : '#ef4444'}]}>{getSymbol(masterCurrency)}{formatValue(conv)}</Text>
                <TouchableOpacity onPress={() => confirmDeleteExpense(item.id)}><Text style={{color:'red',fontSize:20, marginTop: 10}}>🗑️</Text></TouchableOpacity>
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
        const share = getConvertedAmount(e.amount_1, e.currency_1) / (friends.length + 1);
        friends.forEach(f => { settlements[f] = (settlements[f] || 0) + share; });
    });

    return (
        <ScrollView style={{flex:1, padding: 20}}>
          <View style={{height: 40}} /><Text style={styles.appTitle}>ANALYTICS 📊</Text>
          
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Category Spending</Text>
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

  const renderGuide = () => (
    <ScrollView style={{flex:1, padding: 20}}>
      <View style={{height: 40}} /><Text style={[styles.appTitle, {marginBottom: 10}]}>HOW TO USE 📖</Text>
      
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>1. The "Stress-Free" Method</Text>
        <Text style={styles.featureListText}>Don't worry about tracking every penny of physical cash or currency exchange fees.</Text>
        <Text style={styles.featureListText}>• Just log everything you buy as a <Text style={{fontWeight:'bold', color:'#ef4444'}}>DEBIT</Text>.</Text>
        <Text style={styles.featureListText}>• The "Grand Total" shows exactly how much of your own money you have burned.</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>2. Wallet Auto-Sync ⚖️</Text>
        <Text style={styles.featureListText}>Want the app to perfectly match the physical cash in your pocket?</Text>
        <Text style={styles.featureListText}>• Count your physical cash (e.g. 238,000 VND).</Text>
        <Text style={styles.featureListText}>• Tap the "Auto-Sync Physical Wallet" button on the Home screen.</Text>
        <Text style={styles.featureListText}>• The app will find the missing leakage (bad exchange rates, lost coins) and silently fix the math for you!</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>3. Splitting Bills 👥</Text>
        <Text style={styles.featureListText}>• Toggle "Split with Friends" to YES.</Text>
        <Text style={styles.featureListText}>• Enter their names (e.g., Ajay, Rahul).</Text>
        <Text style={styles.featureListText}>• The app calculates the split instantly, and the <Text style={{fontWeight:'bold'}}>Analytics</Text> tab will tell you exactly who owes you.</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>4. Smart PDFs 📤</Text>
        <Text style={styles.featureListText}>Tap Export at the bottom of the home screen to instantly generate a branded PDF report. It automatically formats columns differently if the trip has splits.</Text>
      </View>
      <View style={{height: 120}} />
    </ScrollView>
  );

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
        <Image source={{ uri: 'https://raw.githubusercontent.com/Shitanshu1901/Travel-Expense-Tracker/main/App%20Infographic.png' }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>🌍 Smart Currency Engine</Text>
        <Text style={styles.featureListText}>• Real-Time Home Currency Switching</Text>
        <Text style={styles.featureListText}>• Live Exchange Rates via API</Text>
      </View>
      <View style={{height: 120}} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Trip Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{modalMode === 'add' ? 'New Trip' : 'Edit Trip'}</Text>
          <TextInput style={styles.modalInput} value={newTripName} onChangeText={setNewTripName} placeholder="Trip Name" placeholderTextColor="#94a3b8" />
          <TextInput style={styles.modalInput} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Budget (Optional)" placeholderTextColor="#94a3b8" keyboardType="numeric" />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.modalBtn, {backgroundColor:'#ccc'}]} onPress={() => setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={handleTripSave}><Text style={{color:'#fff'}}>Save</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* Sync Wallet Modal */}
      <Modal visible={syncModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>⚖️ Sync Wallet</Text>
          <Text style={{fontSize: 12, color: '#64748b', marginBottom: 15, textAlign: 'center'}}>Enter the exact cash currently in your hand. We'll fix the math.</Text>
          
          <View style={styles.currencyPickerWrapper} style={{backgroundColor:'#f1f5f9', borderRadius:12, marginBottom:10}}>
              <Picker style={{color:'#000'}} selectedValue={syncCurrency} onValueChange={setSyncCurrency}>
                {CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
              </Picker>
          </View>
          <TextInput style={styles.modalInput} value={syncAmount} onChangeText={setSyncAmount} placeholder="Actual Physical Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" />
          
          <View style={styles.row}>
            <TouchableOpacity style={[styles.modalBtn, {backgroundColor:'#ccc'}]} onPress={() => setSyncModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={handleWalletSync}><Text style={{color:'#fff'}}>Sync</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {currentTab === 'Home' ? renderHome() : currentTab === 'Charts' ? renderCharts() : currentTab === 'Guide' ? renderGuide() : renderFeatures()}

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Home')}><Text style={[styles.tabIcon, currentTab === 'Home' && styles.activeTab]}>🏠</Text><Text style={[styles.tabText, currentTab === 'Home' && styles.activeTab]}>Home</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Charts')}><Text style={[styles.tabIcon, currentTab === 'Charts' && styles.activeTab]}>📊</Text><Text style={[styles.tabText, currentTab === 'Charts' && styles.activeTab]}>Charts</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Guide')}><Text style={[styles.tabIcon, currentTab === 'Guide' && styles.activeTab]}>📖</Text><Text style={[styles.tabText, currentTab === 'Guide' && styles.activeTab]}>Guide</Text></TouchableOpacity>
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
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grandTotalText: { textAlign: 'center', fontSize: 16, fontWeight: '900', color: '#10b981', marginTop: 10 },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, height: 45, justifyContent: 'center' },
  iconBtn: { backgroundColor: '#f1f5f9', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  plusText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  inputCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 20, elevation: 5 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, color: '#000' },
  dateSelector: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 15 },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center', marginRight: 5 },
  typeToggle: { paddingHorizontal: 15, height: 45, borderRadius: 12, justifyContent: 'center', marginLeft: 10 },
  splitToggle: { padding: 10, borderRadius: 10, backgroundColor: '#e2e8f0' },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  exportBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 12, alignItems: 'center', margin: 15 },
  syncBtn: { backgroundColor: '#eef2ff', padding: 8, borderRadius: 8, alignItems: 'center', marginTop: 10, borderColor: '#c7d2fe', borderWidth: 1 },
  syncBtnText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 12 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 16, borderLeftWidth: 5, borderColor: '#3b82f6', elevation: 2 },
  cardDate: { fontSize: 10, color: '#94a3b8' },
  cardDesc: { fontWeight: 'bold', fontSize: 15, color: '#1e293b', marginTop: 2 },
  cardCategory: { fontSize: 12, color: '#475569', marginTop: 2 },
  cardOrigAmt: { fontSize: 12, color: '#64748b', marginTop: 2 },
  cardAmt: { fontWeight: 'bold', fontSize: 18 },
  rateText: { fontSize: 10, color: '#10b981', fontWeight: 'bold', marginTop: 4 },
  splitSubText: { fontSize: 11, color: '#3b82f6', fontStyle: 'italic', fontWeight: 'bold', marginTop: 4 },
  summaryCardCompact: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f1f5f9', padding: 10, borderRadius: 10, marginTop: 10 },
  legendText: { fontSize: 10, fontWeight: 'bold', color: '#1e293b' },
  budgetContainer: { marginTop: 10 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  budgetLabel: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  progressBarBg: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', height: 95, borderTopWidth: 1, borderColor: '#e2e8f0', paddingBottom: 40 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 22, color: '#94a3b8' },
  tabText: { fontSize: 10, fontWeight: 'bold', color: '#64748b' },
  activeTab: { color: '#3b82f6' },
  summaryCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, elevation: 3, marginBottom: 15 },
  summaryTitle: { fontWeight: 'bold', marginBottom: 15, color: '#1e293b', fontSize: 16 },
  featureListText: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 25, borderRadius: 25, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#000' },
  modalInput: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, marginBottom: 15, color: '#000' },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981' }
});
