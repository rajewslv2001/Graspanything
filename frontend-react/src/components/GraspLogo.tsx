import { useNavigate } from "react-router-dom";
import BonsaiSvg from "./BonsaiSvg";

const GraspLogo = ({ size = "default" }: { size?: "default" | "small" }) => {
  const navigate = useNavigate();
  const textClass = size === "small" ? "text-xs" : "text-sm";
  const bonsaiSize = size === "small" ? 36 : 48;

  return (
    <div onClick={() => navigate("/")} className="flex items-end gap-0 cursor-pointer">
      <span className={`font-pixel ${textClass} text-foreground leading-none pb-1`}>
        Grasp
      </span>
      <BonsaiSvg size={bonsaiSize} />
    </div>
  );
};

export default GraspLogo;
