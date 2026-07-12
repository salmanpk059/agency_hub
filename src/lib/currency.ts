export const getCurrencySymbol = (currency?: string) => {
  switch (currency) {
    case 'GBP': return '£';
    case 'EUR': return '€';
    case 'USD':
    default:
      return '$';
  }
};

export const formatAmount = (amount: number, currency?: string) => {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
