import logging
from dotenv import load_dotenv
from app.config import settings

logger = logging.getLogger("alpaca_client")

class AlpacaClientManager:
    def __init__(self):
        self.api_key = ""
        self.secret_key = ""
        self.base_url = ""
        self.is_live_paper_available = False
        self.trading_client = None
        self.data_client = None
        
        self.reload_clients()

    def reload_clients(self):
        from pathlib import Path
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
        load_dotenv(dotenv_path=env_path, override=True)
        import os
        self.api_key = os.getenv("ALPACA_API_KEY", settings.ALPACA_API_KEY)
        self.secret_key = os.getenv("ALPACA_SECRET_KEY", settings.ALPACA_SECRET_KEY)
        self.base_url = os.getenv("ALPACA_BASE_URL", settings.ALPACA_BASE_URL)
        demo_mode = os.getenv("DEMO_MODE", "false").lower() in ("true", "1", "yes")

        if self.api_key and self.secret_key and not demo_mode and "your_alpaca" not in self.api_key and "PKV7GCCHG7LIDKGOBMFFN73MJY" not in self.api_key:
            try:
                from alpaca.trading.client import TradingClient
                from alpaca.data.historical import StockHistoricalDataClient
                
                tc = TradingClient(
                    api_key=self.api_key,
                    secret_key=self.secret_key,
                    paper=True
                )
                # Verify credentials against Alpaca API
                acc = tc.get_account()
                self.trading_client = tc
                self.data_client = StockHistoricalDataClient(
                    api_key=self.api_key,
                    secret_key=self.secret_key
                )
                self.is_live_paper_available = True
                logger.info(f"Connected to Alpaca Paper Trading API (Account: {acc.account_number}).")
            except Exception as e:
                logger.warning(f"Failed to authenticate with Alpaca API ({e}). Falling back to Paper Simulation.")
                self.is_live_paper_available = False
                self.trading_client = None
                self.data_client = None
        else:
            logger.info("Using Alpaca Paper Simulation Mode (Demo).")
            self.is_live_paper_available = False

    def connect_account(self, api_key: str, secret_key: str, base_url: str = "https://paper-api.alpaca.markets") -> Dict[str, Any]:
        """
        Validates Alpaca Paper Trading credentials, saves to .env, and initializes client.
        """
        from pathlib import Path
        from alpaca.trading.client import TradingClient
        from alpaca.data.historical import StockHistoricalDataClient

        try:
            tc = TradingClient(api_key=api_key, secret_key=secret_key, paper=True)
            acc = tc.get_account()
            self.api_key = api_key
            self.secret_key = secret_key
            self.base_url = base_url
            self.trading_client = tc
            self.data_client = StockHistoricalDataClient(api_key=api_key, secret_key=secret_key)
            self.is_live_paper_available = True

            # Save credentials to .env
            env_path = Path(__file__).resolve().parent.parent.parent / ".env"
            env_lines = []
            if env_path.exists():
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if not (line.startswith("ALPACA_API_KEY=") or line.startswith("ALPACA_SECRET_KEY=") or line.startswith("ALPACA_BASE_URL=")):
                            env_lines.append(line.rstrip("\r\n"))
            env_lines.append(f"ALPACA_API_KEY={api_key}")
            env_lines.append(f"ALPACA_SECRET_KEY={secret_key}")
            env_lines.append(f"ALPACA_BASE_URL={base_url}")
            env_lines.append("DEMO_MODE=false")

            with open(env_path, "w", encoding="utf-8") as f:
                f.write("\n".join(env_lines) + "\n")

            logger.info(f"Successfully connected and saved Alpaca Paper Account: {acc.account_number}")
            return {
                "success": True,
                "connected": True,
                "account_number": acc.account_number,
                "portfolio_value": float(acc.portfolio_value),
                "buying_power": float(acc.buying_power),
                "cash": float(acc.cash),
                "status": acc.status.value if hasattr(acc.status, "value") else str(acc.status),
                "mode": "ALPACA_PAPER_API"
            }
        except Exception as e:
            logger.error(f"Failed to connect Alpaca account: {e}")
            return {"success": False, "connected": False, "error": str(e)}

    def get_status(self) -> Dict[str, Any]:
        if self.is_live_paper_available and self.trading_client:
            try:
                acc = self.trading_client.get_account()
                return {
                    "connected": True,
                    "mode": "ALPACA_PAPER_API",
                    "account_number": acc.account_number,
                    "portfolio_value": float(acc.portfolio_value),
                    "buying_power": float(acc.buying_power),
                    "status": "ONLINE"
                }
            except Exception:
                pass
        return {
            "connected": False,
            "mode": "PAPER_SIMULATION",
            "account_number": "SIM-PORTFOLIO-001",
            "portfolio_value": 100000.0,
            "buying_power": 100000.0,
            "status": "SIMULATION_MODE"
        }

alpaca_manager = AlpacaClientManager()
